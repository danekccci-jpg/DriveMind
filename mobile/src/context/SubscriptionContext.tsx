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
  /**
   * Whether the Google Play product exposes a free-trial offer (7 days).
   * Drives the "free trial" copy on the paywall so the app never promises
   * a trial that the billing product doesn't actually grant.
   */
  freeTrialAvailable: boolean
  buySubscription: () => Promise<void>
  clearError: () => void
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null)

// ── Helpers ───────────────────────────────────────────────────────────────────

function isAndroidSubscriptionProduct(
  product: unknown,
): product is SubscriptionAndroid {
  if (typeof product !== 'object' || product == null) return false
  const candidate = product as SubscriptionAndroid
  const id = (candidate.productId ?? '').trim().toLowerCase()
  const expected = SUBSCRIPTION_SKU.trim().toLowerCase()
  return (
    id === expected &&
    Array.isArray(candidate.subscriptionOfferDetails) &&
    candidate.subscriptionOfferDetails.length > 0
  )
}

type PricingPhaseLike = {
  billingPeriod?: string
  priceAmountMicros?: number | string
}

function hasFreeTrialPhase(offer: {
  pricingPhases?: { pricingPhaseList?: PricingPhaseLike[] }
}): boolean {
  // A Google Play free-trial phase is a pricing phase with zero price
  // (e.g. "P1W" trial with priceAmountMicros = 0 before the paid phase).
  return (offer.pricingPhases?.pricingPhaseList ?? []).some(
    (phase) =>
      phase.priceAmountMicros !== undefined && Number(phase.priceAmountMicros) === 0,
  )
}

function hasWeeklyPhase(offer: {
  pricingPhases?: { pricingPhaseList?: PricingPhaseLike[] }
}): boolean {
  return (offer.pricingPhases?.pricingPhaseList ?? []).some(
    (phase) => phase.billingPeriod === 'P1W',
  )
}

export type SelectedSubscriptionOffer = {
  token: string | null
  /** Whether the chosen offer grants a free-trial phase (7 days in Play Console). */
  hasFreeTrial: boolean
}

/**
 * Selects the Google Play offer used for checkout.
 *
 * Priority:
 *  1. Weekly offer that includes a free-trial phase — the 7-day trial only
 *     applies when this offer token is used; picking a plain offer charges
 *     the card immediately.
 *  2. Any offer with a free-trial phase.
 *  3. Any weekly offer (no trial).
 *  4. First available offer.
 */
function pickOffer(product: SubscriptionAndroid): SelectedSubscriptionOffer {
  const offers = product.subscriptionOfferDetails ?? []

  const weeklyTrial = offers.find((o) => hasWeeklyPhase(o) && hasFreeTrialPhase(o))
  if (weeklyTrial) return { token: weeklyTrial.offerToken, hasFreeTrial: true }

  const anyTrial = offers.find(hasFreeTrialPhase)
  if (anyTrial) return { token: anyTrial.offerToken, hasFreeTrial: true }

  const weekly = offers.find(hasWeeklyPhase)
  if (weekly) return { token: weekly.offerToken, hasFreeTrial: false }

  const first = offers[0]
  return { token: first?.offerToken ?? null, hasFreeTrial: false }
}

/** Small delay helper for BillingClient settlement. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Guards against redundant/parallel BillingClient connections across the process lifetime. */
let iapConnectionEstablished = false

/**
 * Ensures the BillingClient connection is initialised exactly once per process.
 * Safe to call repeatedly — never throws (a dead billing service must never
 * crash the boot sequence; the paywall simply shows a retry error instead).
 */
async function ensureIapConnection(): Promise<void> {
  if (iapConnectionEstablished) return
  try {
    await initConnection()
    await flushFailedPurchasesCachedAsPendingAndroid()
    iapConnectionEstablished = true
  } catch (e) {
    console.error('[DriveMind] IAP initConnection failed:', e)
    throw e
  }
}

/**
 * Fetches the Android subscription product from Google Play with retry logic.
 *
 * The empty-array bug happens when BillingClient.initConnection() resolves
 * before the service is fully bound.  We retry once with a full disconnect
 * + re-init + settlement delay to work around it.
 */
async function loadAndroidSubscriptionProduct(): Promise<SubscriptionAndroid> {
  const attempt = async (firstTry: boolean): Promise<SubscriptionAndroid | null> => {
    if (firstTry) {
      await ensureIapConnection()
    } else {
      try {
        await endConnection()
      } catch {
        /* may not be connected */
      }
      iapConnectionEstablished = false
      await sleep(1500)
      await initConnection()
      await flushFailedPurchasesCachedAsPendingAndroid()
      iapConnectionEstablished = true
      await sleep(500)
    }

    const subs = await getSubscriptions({ skus: [SUBSCRIPTION_SKU] })
    const match = subs.find(isAndroidSubscriptionProduct)
    if (match) return match

    const returnedSubIds = subs.map((p) => p.productId).filter(Boolean).join(', ') || '(none)'
    console.warn(
      `[DriveMind] IAP: attempt ${firstTry ? 'first' : 'retry'} — ` +
        `getSubscriptions returned [${returnedSubIds}] for SKU "${SUBSCRIPTION_SKU}"`,
    )
    return null
  }

  // First attempt
  let product = await attempt(true)
  if (product) return product

  // Retry with full connection reset
  product = await attempt(false)
  if (product) return product

  const msg =
    `Subscription product "${SUBSCRIPTION_SKU}" is not available. ` +
    `Verify the product exists and is active in Play Console → Monetize → Subscriptions ` +
    `for package "${ANDROID_PACKAGE_NAME}".`
  console.error('[DriveMind] IAP:', msg)
  throw new Error(msg)
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
  const [freeTrialAvailable, setFreeTrialAvailable] = useState(false)

  const verifyingTokensRef = useRef<Set<string>>(new Set())
  const subscriptionOfferRef = useRef<SelectedSubscriptionOffer | null>(null)

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
        const product = await loadAndroidSubscriptionProduct()
        if (!cancelled) {
          const offer = pickOffer(product)
          subscriptionOfferRef.current = offer
          setFreeTrialAvailable(offer.hasFreeTrial)
          if (!offer.hasFreeTrial) {
            console.warn(
              `[DriveMind] IAP: no free-trial offer for "${SUBSCRIPTION_SKU}". ` +
                'Add a 7-day free trial offer in Play Console → Monetize → Subscriptions ' +
                'so checkout starts with the trial phase.',
            )
          }
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
        console.error('[DriveMind] IAP init failed:', error)
      } finally {
        if (!cancelled) setIapReady(true)
      }
    })()

    return () => {
      cancelled = true
      purchaseSub?.remove()
      errorSub?.remove()
      iapConnectionEstablished = false
      void endConnection().catch(() => { /* may not be connected */ })
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
      let offer = subscriptionOfferRef.current
      if (!offer) {
        const product = await loadAndroidSubscriptionProduct()
        offer = pickOffer(product)
        subscriptionOfferRef.current = offer
        setFreeTrialAvailable(offer.hasFreeTrial)
      }

      if (!offer.token) {
        throw new Error(
          `No subscription offer token for "${SUBSCRIPTION_SKU}" — activate a weekly base plan in Play Console.`,
        )
      }

      await requestSubscription({
        sku: SUBSCRIPTION_SKU,
        subscriptionOffers: [{ sku: SUBSCRIPTION_SKU, offerToken: offer.token }],
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
      freeTrialAvailable,
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
      freeTrialAvailable,
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
