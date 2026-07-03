import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Platform } from 'react-native'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { doc, onSnapshot, type Timestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import {
  ErrorCode,
  flushFailedPurchasesCachedAsPendingAndroid,
  finishTransaction,
  getSubscriptions,
  initConnection,
  endConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestSubscription,
  PurchaseStateAndroid,
  type ProductPurchase,
  type Purchase,
  type PurchaseError,
  type SubscriptionAndroid,
} from 'react-native-iap'

import { getFirebaseAuth, getFirebaseFunctions, getFirestoreDb, isFirebaseConfigured } from '../config/firebase'
import {
  ANDROID_PACKAGE_NAME,
  SUBSCRIPTION_SKU,
  type SubscriptionFirestoreStatus,
  type UserSubscriptionRecord,
} from '../constants/subscription'
import { useAuthStore, isGuestEmail } from '../store/authStore'
import { USERS_COLLECTION, evaluatePaywallState, type FirestoreUser } from '../services/userFirestoreService'
import { syncOrderParsingGate } from '../services/subscriptionGate'

// ── Types ─────────────────────────────────────────────────────────────────────

type VerifySubscriptionResult = {
  ok: boolean
  status: SubscriptionFirestoreStatus
  expiresAtMs: number | null
  subscriptionId: string
  paymentState: number | null
  acknowledged: boolean
}

export type SubscriptionContextValue = {
  isLoading: boolean
  /** Paid Google Play subscription currently active (server-verified). */
  isPremium: boolean
  /** Premium OR valid trial window — gates full app access. */
  hasAppAccess: boolean
  subscription: UserSubscriptionRecord | null
  subscriptionStatus: SubscriptionFirestoreStatus | 'none'
  isPurchasing: boolean
  lastError: string | null
  buySubscription: () => Promise<void>
  clearError: () => void
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null)

// ── Helpers ───────────────────────────────────────────────────────────────────

function isAndroidSubscriptionProduct(
  product: unknown,
): product is SubscriptionAndroid {
  return (
    typeof product === 'object' &&
    product != null &&
    'subscriptionOfferDetails' in product &&
    Array.isArray((product as SubscriptionAndroid).subscriptionOfferDetails)
  )
}

function timestampToDate(value: unknown): Date | null {
  if (value == null) return null
  if (value instanceof Date) return value
  if (typeof value === 'object' && 'toDate' in (value as Timestamp)) {
    return (value as Timestamp).toDate()
  }
  if (typeof value === 'object' && 'seconds' in (value as object)) {
    return new Date((value as { seconds: number }).seconds * 1000)
  }
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isFinite(parsed.getTime()) ? parsed : null
  }
  return null
}

function parseSubscriptionField(raw: unknown): UserSubscriptionRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  const status = data.status
  if (status !== 'active' && status !== 'expired' && status !== 'pending') return null
  return {
    status,
    expiresAt: timestampToDate(data.expiresAt),
    subscriptionId: typeof data.subscriptionId === 'string' ? data.subscriptionId : null,
    lastVerified: timestampToDate(data.lastVerified),
    purchaseToken: typeof data.purchaseToken === 'string' ? data.purchaseToken : null,
  }
}

function isPaidPremium(sub: UserSubscriptionRecord | null): boolean {
  if (!sub || sub.status !== 'active' || !sub.expiresAt) return false
  return sub.expiresAt.getTime() > Date.now()
}

function parseFirestoreUser(data: Record<string, unknown>): FirestoreUser {
  const parseTs = (v: unknown): string | null => {
    const d = timestampToDate(v)
    return d ? d.toISOString() : typeof v === 'string' ? v : null
  }
  const subStatus = data.subscriptionStatus
  const validStatus =
    subStatus === 'welcome_trips' || subStatus === 'trial_active' ||
    subStatus === 'expired' || subStatus === 'subscribed'
  return {
    completedOrdersCount:
      typeof data.completedOrdersCount === 'number' ? data.completedOrdersCount : 0,
    isSubscribed: data.isSubscribed === true,
    trialEndsAt: parseTs(data.trialEndsAt),
    subscriptionEndsAt: parseTs(data.subscriptionEndsAt),
    publicId: typeof data.publicId === 'string' ? data.publicId : '',
    email: typeof data.email === 'string' ? data.email : 'anonymous@drivemind.app',
    subscriptionStatus: validStatus ? subStatus : 'welcome_trips',
    deviceFingerprint:
      typeof data.deviceFingerprint === 'string' ? data.deviceFingerprint : null,
  }
}

function purchaseTokenFrom(purchase: Purchase): string {
  return (purchase.purchaseToken ?? '').trim()
}

function isAndroidPending(purchase: Purchase): boolean {
  if (Platform.OS !== 'android') return false
  return (purchase as ProductPurchase).purchaseStateAndroid === PurchaseStateAndroid.PENDING
}

function formatPurchaseError(error: PurchaseError | unknown): string {
  const code = (error as PurchaseError | undefined)?.code
  if (code === ErrorCode.E_USER_CANCELLED) return 'Purchase cancelled.'
  if (code === ErrorCode.E_ALREADY_OWNED) return 'You already own this subscription.'
  if (code === ErrorCode.E_NETWORK_ERROR) return 'Network error — check your connection and retry.'
  if (code === ErrorCode.E_SERVICE_ERROR) return 'Google Play is unavailable. Try again shortly.'
  const message = (error as Error | undefined)?.message
  return message?.trim() || 'Purchase failed. Please try again.'
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const userEmail = useAuthStore((s) => s.userEmail)
  const isGuest = isGuestEmail(userEmail)

  const [authReady, setAuthReady] = useState(false)
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [firestoreReady, setFirestoreReady] = useState(false)
  const [iapReady, setIapReady] = useState(Platform.OS !== 'android')
  const [subscription, setSubscription] = useState<UserSubscriptionRecord | null>(null)
  const [trialUser, setTrialUser] = useState<FirestoreUser | null>(null)
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const verifyingTokensRef = useRef<Set<string>>(new Set())
  const subscriptionProductRef = useRef<SubscriptionAndroid | null>(null)

  const isPremium = useMemo(() => isPaidPremium(subscription), [subscription])

  const hasAppAccess = useMemo(() => {
    if (!isFirebaseConfigured()) return true
    if (isGuest) return false
    if (isPremium) return true
    if (!trialUser) return false
    const { blocked } = evaluatePaywallState(trialUser)
    return !blocked
  }, [isGuest, isPremium, trialUser])

  const subscriptionStatus: SubscriptionFirestoreStatus | 'none' =
    subscription?.status ?? 'none'

  const firebaseEnabled = isFirebaseConfigured()
  const isLoading =
    firebaseEnabled &&
    (!authReady || (!isGuest && (!firestoreReady || !iapReady)))

  const clearError = useCallback(() => setLastError(null), [])

  const applyFirestoreUser = useCallback((uid: string, data: Record<string, unknown>) => {
    const parsedSub = parseSubscriptionField(data.subscription)
    setSubscription(parsedSub)

    const user = parseFirestoreUser(data)
    if (parsedSub && isPaidPremium(parsedSub)) {
      user.isSubscribed = true
      if (parsedSub.expiresAt) {
        user.subscriptionEndsAt = parsedSub.expiresAt.toISOString()
      }
    }
    setTrialUser(user)

    const { mode, blocked, searchBlocked, remainingTrips } = evaluatePaywallState(user)
    useAuthStore.getState().setSubscription({
      firebaseUid: uid,
      completedOrdersCount: user.completedOrdersCount,
      isSubscribed: user.isSubscribed,
      trialEndsAt: user.trialEndsAt,
      subscriptionEndsAt: user.subscriptionEndsAt,
      publicId: user.publicId,
      paywallMode: mode,
      isPaywallBlocked: blocked,
      isSearchBlocked: searchBlocked,
      remainingTrips,
    })
    syncOrderParsingGate(user)
  }, [])

  const verifyOnServer = useCallback(
    async (purchase: Purchase): Promise<VerifySubscriptionResult | null> => {
      const token = purchaseTokenFrom(purchase)
      if (!token) return null

      if (verifyingTokensRef.current.has(token)) return null
      verifyingTokensRef.current.add(token)

      try {
        const callable = httpsCallable<
          { purchaseToken: string; subscriptionId: string; packageName: string },
          VerifySubscriptionResult
        >(getFirebaseFunctions(), 'verifySubscription')

        const productId = purchase.productId ?? SUBSCRIPTION_SKU
        const { data } = await callable({
          purchaseToken: token,
          subscriptionId: productId,
          packageName: ANDROID_PACKAGE_NAME,
        })
        return data
      } finally {
        verifyingTokensRef.current.delete(token)
      }
    },
    [],
  )

  const handlePurchase = useCallback(
    async (purchase: Purchase) => {
      const token = purchaseTokenFrom(purchase)
      if (!token) return

      if (isAndroidPending(purchase)) {
        try {
          const result = await verifyOnServer(purchase)
          if (result?.status === 'pending') {
            setLastError('Payment pending — complete BLIK authorization in your bank app.')
          }
        } catch (error) {
          setLastError(formatPurchaseError(error))
        } finally {
          setIsPurchasing(false)
        }
        return
      }

      try {
        const result = await verifyOnServer(purchase)
        if (result?.ok) {
          await finishTransaction({ purchase, isConsumable: false })
          setLastError(null)
        } else if (result?.status === 'pending') {
          setLastError('Payment pending — we will activate premium once your bank confirms.')
        } else {
          setLastError('Subscription could not be verified. Contact support if you were charged.')
        }
      } catch (error) {
        setLastError(formatPurchaseError(error))
      } finally {
        setIsPurchasing(false)
      }
    },
    [verifyOnServer],
  )

  // ── Firebase Auth ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setAuthReady(true)
      setFirestoreReady(true)
      return
    }

    const auth = getFirebaseAuth()
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user)
      setAuthReady(true)
      if (!user) {
        setSubscription(null)
        setTrialUser(null)
        setFirestoreReady(true)
      } else {
        setFirestoreReady(false)
      }
    })
    return unsub
  }, [])

  // ── Firestore realtime listener ─────────────────────────────────────────────
  useEffect(() => {
    if (!isFirebaseConfigured() || isGuest || !firebaseUser) {
      setFirestoreReady(true)
      return
    }

    const ref = doc(getFirestoreDb(), USERS_COLLECTION, firebaseUser.uid)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          applyFirestoreUser(firebaseUser.uid, snap.data() as Record<string, unknown>)
        }
        setFirestoreReady(true)
      },
      () => {
        setFirestoreReady(true)
      },
    )
    return unsub
  }, [firebaseUser, isGuest, applyFirestoreUser])

  // ── react-native-iap lifecycle ──────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'android' || isGuest || !isFirebaseConfigured()) {
      setIapReady(true)
      return
    }

    let purchaseSub: ReturnType<typeof purchaseUpdatedListener> | null = null
    let errorSub: ReturnType<typeof purchaseErrorListener> | null = null
    let cancelled = false

    void (async () => {
      try {
        await initConnection()
        if (cancelled) return
        await flushFailedPurchasesCachedAsPendingAndroid()
        if (cancelled) return

        const products = await getSubscriptions({ skus: [SUBSCRIPTION_SKU] })
        if (!cancelled && products.length > 0 && isAndroidSubscriptionProduct(products[0])) {
          subscriptionProductRef.current = products[0]
        }

        purchaseSub = purchaseUpdatedListener((purchase) => {
          void handlePurchase(purchase)
        })
        errorSub = purchaseErrorListener((error) => {
          setIsPurchasing(false)
          if (error.code !== ErrorCode.E_USER_CANCELLED) {
            setLastError(formatPurchaseError(error))
          }
        })
      } catch (error) {
        if (__DEV__) console.warn('[DriveMind] IAP init failed', error)
      } finally {
        if (!cancelled) setIapReady(true)
      }
    })()

    return () => {
      cancelled = true
      purchaseSub?.remove()
      errorSub?.remove()
      void endConnection()
    }
  }, [isGuest, handlePurchase])

  const buySubscription = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setLastError('Subscriptions are only available on Android.')
      return
    }
    if (!firebaseUser) {
      setLastError('Sign in before subscribing.')
      return
    }

    setIsPurchasing(true)
    setLastError(null)

    try {
      let product = subscriptionProductRef.current
      if (!product) {
        const products = await getSubscriptions({ skus: [SUBSCRIPTION_SKU] })
        const candidate = products.find(isAndroidSubscriptionProduct)
        if (!candidate) {
          throw new Error('Subscription product is not configured in Google Play Console.')
        }
        product = candidate
        subscriptionProductRef.current = product
      }

      const offerToken = product.subscriptionOfferDetails[0]?.offerToken
      if (!offerToken) {
        throw new Error('No subscription offer token — check Play Console base plan.')
      }

      await requestSubscription({
        sku: SUBSCRIPTION_SKU,
        subscriptionOffers: [{ sku: SUBSCRIPTION_SKU, offerToken }],
      })
      // purchaseUpdatedListener handles verification + finishTransaction.
    } catch (error) {
      setIsPurchasing(false)
      setLastError(formatPurchaseError(error))
    }
  }, [firebaseUser])

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      isLoading,
      isPremium,
      hasAppAccess,
      subscription,
      subscriptionStatus,
      isPurchasing,
      lastError,
      buySubscription,
      clearError,
    }),
    [
      isLoading,
      isPremium,
      hasAppAccess,
      subscription,
      subscriptionStatus,
      isPurchasing,
      lastError,
      buySubscription,
      clearError,
    ],
  )

  return (
    <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>
  )
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext)
  if (!ctx) {
    throw new Error('useSubscription must be used within SubscriptionProvider')
  }
  return ctx
}
