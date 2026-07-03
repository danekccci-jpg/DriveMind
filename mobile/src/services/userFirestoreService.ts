import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  increment,
  Timestamp,
  type DocumentData,
} from 'firebase/firestore'
import { DeviceEventEmitter } from 'react-native'

import { getFirestoreDb } from '../config/firebase'
import { useAuthStore, isGuestEmail } from '../store/authStore'
import { generatePublicId } from '../utils/secureRandom'
import { syncOrderParsingGate, syncOverlaySubscriptionHint, EVENT_OPEN_PAYWALL } from './subscriptionGate'
import {
  incrementGuestOrderCountRemote,
  getRemoteGuestOrderCount,
} from './deviceFingerprintFirestore'
import { sendTrialExhaustedNotification } from './localNotifications'

// ─── Constants ───────────────────────────────────────────────────────────────

export const USERS_COLLECTION = 'users'
/** Welcome trips: free order evaluations before trial timer starts. */
export const WELCOME_TRIPS_LIMIT = 15
/** Guest users: max completed orders before they must register. */
export const GUEST_ORDER_THRESHOLD = 2
/** 7-day trial duration activated when welcome trips are exhausted. */
export const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000

// ─── Types ───────────────────────────────────────────────────────────────────

export type SubscriptionStatus = 'welcome_trips' | 'trial_active' | 'expired' | 'subscribed'

export type PaywallMode = 'none' | 'onboarding' | 'expired'

export interface FirestoreUser {
  completedOrdersCount: number
  isSubscribed: boolean
  /** Legacy: time-based countdown triggered when order limit is hit. Kept for compatibility. */
  trialEndsAt: string | null
  /** Absolute trial expiry — set to (createdAt + 7 days) on account creation. */
  subscriptionEndsAt: string | null
  /** 8-digit numeric public ID for customer support and UI display. */
  publicId: string
  /** User email from Firebase Auth (or "anonymous@drivemind.app" for guest). */
  email: string
  /** Current subscription funnel status. */
  subscriptionStatus: SubscriptionStatus
  /** Device fingerprint recorded at account creation for anti-abuse checks. */
  deviceFingerprint: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function usersRef(uid: string) {
  return doc(getFirestoreDb(), USERS_COLLECTION, uid)
}

function parseTimestamp(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (typeof value === 'string') return value
  if (typeof value === 'object' && 'seconds' in (value as object)) {
    return new Date((value as { seconds: number }).seconds * 1000).toISOString()
  }
  return null
}

function parseUserDoc(data: DocumentData): FirestoreUser {
  return {
    completedOrdersCount:
      typeof data.completedOrdersCount === 'number' ? data.completedOrdersCount : 0,
    isSubscribed: data.isSubscribed === true,
    trialEndsAt: parseTimestamp(data.trialEndsAt),
    subscriptionEndsAt: parseTimestamp(data.subscriptionEndsAt),
    publicId: typeof data.publicId === 'string' ? data.publicId : generatePublicId(),
    email: typeof data.email === 'string' ? data.email : 'anonymous@drivemind.app',
    subscriptionStatus: isValidSubscriptionStatus(data.subscriptionStatus)
      ? data.subscriptionStatus
      : 'welcome_trips',
    deviceFingerprint: typeof data.deviceFingerprint === 'string' ? data.deviceFingerprint : null,
  }
}

function isValidSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return value === 'welcome_trips' || value === 'trial_active' || value === 'expired' || value === 'subscribed'
}

// ─── Core subscription logic ──────────────────────────────────────────────────

/**
 * Two-phase funnel:
 *   Phase 1 — completedOrdersCount < WELCOME_TRIPS_LIMIT → free, no restrictions
 *   Phase 2 — trips exhausted, trialEndsAt set → 7-day countdown active
 *   Phase 3 — trial expired → hard paywall
 */
export function isSearchBlocked(
  user: Pick<FirestoreUser, 'completedOrdersCount' | 'isSubscribed' | 'trialEndsAt' | 'subscriptionEndsAt'>,
): boolean {
  if (user.isSubscribed) return false

  // Phase 1: Welcome trips still available
  if (user.completedOrdersCount < WELCOME_TRIPS_LIMIT) return false

  // Phase 2: 7-day trial active
  if (user.trialEndsAt) {
    const expiresAt = new Date(user.trialEndsAt).getTime()
    if (Number.isFinite(expiresAt) && Date.now() <= expiresAt) return false
  }

  // Legacy: subscriptionEndsAt from older accounts
  if (user.subscriptionEndsAt) {
    const expiresAt = new Date(user.subscriptionEndsAt).getTime()
    if (Number.isFinite(expiresAt) && Date.now() <= expiresAt) return false
  }

  // Phase 3: All exhausted
  return true
}

export function evaluatePaywallState(user: FirestoreUser): {
  mode: PaywallMode
  blocked: boolean
  searchBlocked: boolean
  remainingTrips: number
} {
  if (user.isSubscribed) {
    return { mode: 'none', blocked: false, searchBlocked: false, remainingTrips: -1 }
  }

  const remainingTrips = Math.max(0, WELCOME_TRIPS_LIMIT - user.completedOrdersCount)

  // Phase 1: Welcome trips remaining
  if (remainingTrips > 0) {
    return { mode: 'none', blocked: false, searchBlocked: false, remainingTrips }
  }

  // Phase 2: Trial window (trialEndsAt set when trip 15 consumed)
  if (user.trialEndsAt) {
    const expiresAt = new Date(user.trialEndsAt).getTime()
    if (Number.isFinite(expiresAt) && Date.now() <= expiresAt) {
      return { mode: 'onboarding', blocked: false, searchBlocked: false, remainingTrips: 0 }
    }
  }

  // Legacy: subscriptionEndsAt from older accounts
  if (user.subscriptionEndsAt) {
    const expiresAt = new Date(user.subscriptionEndsAt).getTime()
    if (Number.isFinite(expiresAt) && Date.now() <= expiresAt) {
      return { mode: 'onboarding', blocked: false, searchBlocked: false, remainingTrips: 0 }
    }
  }

  // Phase 3: Hard paywall
  return { mode: 'expired', blocked: true, searchBlocked: true, remainingTrips: 0 }
}

// ─── Firestore CRUD ───────────────────────────────────────────────────────────

export async function deleteUserFirestoreDoc(uid: string): Promise<void> {
  await deleteDoc(usersRef(uid))
}

export async function fetchUserDoc(uid: string): Promise<FirestoreUser | null> {
  const snap = await getDoc(usersRef(uid))
  if (!snap.exists()) return null
  return parseUserDoc(snap.data())
}

/**
 * Ensures a Firestore user document exists keyed by Firebase Auth UID.
 * If the document exists, returns it (never overwrites).
 * If missing, creates with `.set()` using the canonical initial schema.
 */
function defaultNewUser(email: string, deviceFingerprint?: string | null): FirestoreUser {
  const publicId = generatePublicId()
  return {
    completedOrdersCount: 0,
    isSubscribed: false,
    trialEndsAt: null,
    subscriptionEndsAt: null,
    publicId,
    email,
    subscriptionStatus: 'welcome_trips',
    deviceFingerprint: deviceFingerprint ?? null,
  }
}

export async function ensureUserDoc(
  uid: string,
  email?: string | null,
  deviceFingerprint?: string | null,
): Promise<FirestoreUser> {
  const userEmail = email?.trim() || 'anonymous@drivemind.app'

  try {
    const existing = await fetchUserDoc(uid)
    if (existing) {
      const updates: Record<string, unknown> = {}
      if (!existing.publicId || existing.publicId.includes('-')) {
        updates.publicId = generatePublicId()
      }
      if (!existing.email || existing.email === 'anonymous@drivemind.app') {
        if (userEmail !== 'anonymous@drivemind.app') updates.email = userEmail
      }
      if (!existing.deviceFingerprint && deviceFingerprint) {
        updates.deviceFingerprint = deviceFingerprint
      }
      if (Object.keys(updates).length > 0) {
        await updateDoc(usersRef(uid), updates)
        const merged: DocumentData = { ...existing, ...updates }
        return parseUserDoc(merged)
      }
      return existing
    }

    const publicId = generatePublicId()
    const now = Date.now()

    const payload: Record<string, unknown> = {
      publicId,
      email: userEmail,
      completedOrdersCount: 0,
      subscriptionStatus: 'welcome_trips',
      isSubscribed: false,
      createdAt: Timestamp.fromMillis(now),
    }
    if (deviceFingerprint) payload.deviceFingerprint = deviceFingerprint

    await setDoc(usersRef(uid), payload)

    return {
      completedOrdersCount: 0,
      isSubscribed: false,
      trialEndsAt: null,
      subscriptionEndsAt: null,
      publicId,
      email: userEmail,
      subscriptionStatus: 'welcome_trips',
      deviceFingerprint: deviceFingerprint ?? null,
    }
  } catch (e) {
    if (__DEV__) console.warn('[DriveMind] ensureUserDoc failed, using local defaults', e)
    return defaultNewUser(userEmail, deviceFingerprint)
  }
}

// ─── Session sync ─────────────────────────────────────────────────────────────

/** @deprecated Only sets trialEndsAt when the order count hits WELCOME_TRIPS_LIMIT. Kept for legacy callers. */
async function maybeStartLegacyTrial(uid: string, user: FirestoreUser): Promise<FirestoreUser> {
  if (user.trialEndsAt != null) return user
  if (user.completedOrdersCount < WELCOME_TRIPS_LIMIT) return user

  const trialEndsAt = Timestamp.fromMillis(Date.now() + TRIAL_DURATION_MS)
  await updateDoc(usersRef(uid), { trialEndsAt })
  return { ...user, trialEndsAt: trialEndsAt.toDate().toISOString() }
}

export async function syncUserSession(
  uid: string,
  email?: string | null,
  deviceFingerprint?: string | null,
): Promise<{
  user: FirestoreUser
  mode: PaywallMode
  blocked: boolean
  searchBlocked: boolean
  remainingTrips: number
}> {
  let user = await ensureUserDoc(uid, email, deviceFingerprint)
  try {
    user = await maybeStartLegacyTrial(uid, user)
  } catch {
    /* non-critical legacy trial back-fill */
  }
  const { mode, blocked, searchBlocked, remainingTrips } = evaluatePaywallState(user)
  syncOrderParsingGate(user)
  return { user, mode, blocked, searchBlocked, remainingTrips }
}

export function applyUserSessionToStore(
  uid: string,
  user: FirestoreUser,
  mode: PaywallMode,
  blocked: boolean,
  searchBlocked: boolean,
  remainingTrips?: number,
): void {
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
    remainingTrips: remainingTrips ?? Math.max(0, WELCOME_TRIPS_LIMIT - user.completedOrdersCount),
  })
  syncOrderParsingGate(user)
}

// ─── Order completion notifications ──────────────────────────────────────────

export async function recordOrderCompleted(uid: string): Promise<FirestoreUser | null> {
  const ref = usersRef(uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null

  const current = parseUserDoc(snap.data())
  if (current.isSubscribed) return current

  const nextCount = current.completedOrdersCount + 1
  const updates: Record<string, unknown> = { completedOrdersCount: increment(1) }

  if (nextCount >= WELCOME_TRIPS_LIMIT && current.trialEndsAt == null) {
    updates.trialEndsAt = Timestamp.fromMillis(Date.now() + TRIAL_DURATION_MS)
    updates.subscriptionStatus = 'trial_active'
  }

  await updateDoc(ref, updates)
  return fetchUserDoc(uid)
}

/** Called when a registered (non-guest) user completes an order. */
export async function notifyOrderCompletedForUser(): Promise<void> {
  const { firebaseUid, userEmail } = useAuthStore.getState()

  // Route guest order completions to their own handler
  if (isGuestEmail(userEmail)) {
    await notifyGuestOrderCompleted()
    return
  }

  if (!firebaseUid) return

  try {
    const updated = await recordOrderCompleted(firebaseUid)
    if (!updated) return
    const { mode, blocked, searchBlocked, remainingTrips } = evaluatePaywallState(updated)
    applyUserSessionToStore(firebaseUid, updated, mode, blocked, searchBlocked, remainingTrips)
    syncOverlaySubscriptionHint()

    // Fire local push when welcome trips just exhausted (trip 15 consumed)
    if (updated.completedOrdersCount === WELCOME_TRIPS_LIMIT) {
      void sendTrialExhaustedNotification()
    }
  } catch (e) {
    if (__DEV__) console.warn('[DriveMind] notifyOrderCompletedForUser failed', e)
  }
}

/**
 * Called when a guest user completes an order.
 *
 * 1. Increments `guestOrderCount` in authStore (local, instant).
 * 2. Writes to Firestore `device_fingerprints/{fp}` in the background.
 * 3. When the guest limit (GUEST_ORDER_THRESHOLD) is hit:
 *    - Marks `isPaywallBlocked = true` in authStore so App.tsx shows the paywall.
 *    - Calls `syncOrderParsingGate()` to stop the native scraper immediately.
 */
export async function notifyGuestOrderCompleted(): Promise<void> {
  const { deviceFingerprint, incrementGuestOrderCount, setGuestBlocked } =
    useAuthStore.getState()

  incrementGuestOrderCount()

  const newLocalCount = useAuthStore.getState().guestOrderCount

  // Background Firestore write — non-blocking
  if (deviceFingerprint) {
    void incrementGuestOrderCountRemote(deviceFingerprint).catch(() => {
      /* noop — never block on Firestore */
    })
  }

  if (newLocalCount >= GUEST_ORDER_THRESHOLD) {
    setGuestBlocked(true)
    syncOrderParsingGate()
    // Give the state a tick to propagate before emitting, so subscribed
    // components re-render before a navigation event fires.
    setTimeout(() => DeviceEventEmitter.emit(EVENT_OPEN_PAYWALL), 50)
  }
}

/**
 * On app launch as a guest, sync the Firestore remote count so reinstalling
 * the app doesn't reset the guest trial (assuming the device UUID survived via
 * SecureStore — which it does across cache wipes but not across reinstalls).
 */
export async function syncGuestOrderCountFromRemote(): Promise<void> {
  const { deviceFingerprint, guestOrderCount, setGuestOrderCount, setGuestBlocked } =
    useAuthStore.getState()
  if (!deviceFingerprint) return

  try {
    const remoteCount = await getRemoteGuestOrderCount(deviceFingerprint)
    if (remoteCount > guestOrderCount) {
      setGuestOrderCount(remoteCount)
      if (remoteCount >= GUEST_ORDER_THRESHOLD) {
        setGuestBlocked(true)
        syncOrderParsingGate()
      }
    }
  } catch {
    /* noop */
  }
}
