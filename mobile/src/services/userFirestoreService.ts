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
import { syncOrderParsingGate, EVENT_OPEN_PAYWALL } from './subscriptionGate'
import {
  incrementGuestOrderCountRemote,
  getRemoteGuestOrderCount,
} from './deviceFingerprintFirestore'

// ─── Constants ───────────────────────────────────────────────────────────────

export const USERS_COLLECTION = 'users'
/** Registered users: max completed orders before trial ends. */
export const TRIAL_ORDER_THRESHOLD = 10
/** Guest users: max completed orders before they must register. */
export const GUEST_ORDER_THRESHOLD = 2
/** Trial duration from the moment of account creation (7 days). */
const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000

// ─── Types ───────────────────────────────────────────────────────────────────

export type PaywallMode = 'none' | 'onboarding' | 'expired'

export interface FirestoreUser {
  completedOrdersCount: number
  isSubscribed: boolean
  /** Legacy: time-based countdown triggered when order limit is hit. Kept for compatibility. */
  trialEndsAt: string | null
  /** Absolute trial expiry — set to (createdAt + 7 days) on account creation. */
  subscriptionEndsAt: string | null
  /** Human-readable public ID (e.g. "DM-A3F2-K9P1"). Never exposes Firebase UID. */
  publicId: string | null
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
    publicId: typeof data.publicId === 'string' ? data.publicId : null,
    deviceFingerprint: typeof data.deviceFingerprint === 'string' ? data.deviceFingerprint : null,
  }
}

// ─── Core subscription logic ──────────────────────────────────────────────────

/**
 * Returns true when a registered (non-guest) user should be blocked from
 * searching for orders.
 *
 * Blocked when ALL of the following:
 *   - Not an active subscriber
 *   - Trial order limit reached  OR  trial time has expired
 */
export function isSearchBlocked(
  user: Pick<FirestoreUser, 'completedOrdersCount' | 'isSubscribed' | 'trialEndsAt' | 'subscriptionEndsAt'>,
): boolean {
  if (user.isSubscribed) return false

  // Time-based expiry (trial window set at account creation)
  if (user.subscriptionEndsAt) {
    const expiresAt = new Date(user.subscriptionEndsAt).getTime()
    if (Number.isFinite(expiresAt) && Date.now() > expiresAt) return true
  }

  // Legacy time window (triggered when orders run out)
  if (user.trialEndsAt) {
    const expiresAt = new Date(user.trialEndsAt).getTime()
    if (Number.isFinite(expiresAt) && Date.now() > expiresAt) return true
  }

  // Order count exhausted
  return user.completedOrdersCount >= TRIAL_ORDER_THRESHOLD
}

export function evaluatePaywallState(user: FirestoreUser): {
  mode: PaywallMode
  blocked: boolean
  searchBlocked: boolean
} {
  if (user.isSubscribed) return { mode: 'none', blocked: false, searchBlocked: false }

  const searchBlocked = isSearchBlocked(user)

  // Check time expiry (subscriptionEndsAt takes priority over legacy trialEndsAt)
  const endsMsNew = user.subscriptionEndsAt
    ? new Date(user.subscriptionEndsAt).getTime()
    : null
  const endsMsLegacy = user.trialEndsAt ? new Date(user.trialEndsAt).getTime() : null
  const endsMs = endsMsNew ?? endsMsLegacy

  if (endsMs != null && Number.isFinite(endsMs) && Date.now() > endsMs) {
    return { mode: 'expired', blocked: true, searchBlocked: true }
  }

  if (searchBlocked) {
    return { mode: 'onboarding', blocked: false, searchBlocked: true }
  }

  return { mode: 'none', blocked: false, searchBlocked: false }
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
 * Ensures a Firestore user document exists.
 * Creates one with `publicId`, `subscriptionEndsAt` (7-day trial) and optional
 * `deviceFingerprint` if the document is missing.
 */
function defaultNewUser(deviceFingerprint?: string | null): FirestoreUser {
  const publicId = generatePublicId()
  return {
    completedOrdersCount: 0,
    isSubscribed: false,
    trialEndsAt: null,
    subscriptionEndsAt: new Date(Date.now() + TRIAL_DURATION_MS).toISOString(),
    publicId,
    deviceFingerprint: deviceFingerprint ?? null,
  }
}

export async function ensureUserDoc(
  uid: string,
  deviceFingerprint?: string | null,
): Promise<FirestoreUser> {
  try {
    const existing = await fetchUserDoc(uid)
    if (existing) {
      // Back-fill publicId / subscriptionEndsAt for accounts created before this version
      const updates: Record<string, unknown> = {}
      if (!existing.publicId) updates.publicId = generatePublicId()
      if (!existing.subscriptionEndsAt) {
        updates.subscriptionEndsAt = Timestamp.fromMillis(Date.now() + TRIAL_DURATION_MS)
      }
      if (!existing.deviceFingerprint && deviceFingerprint) {
        updates.deviceFingerprint = deviceFingerprint
      }
      if (Object.keys(updates).length > 0) {
        await updateDoc(usersRef(uid), updates)
        const merged: DocumentData = { ...existing }
        if (typeof updates.publicId === 'string') merged.publicId = updates.publicId
        if (updates.subscriptionEndsAt instanceof Timestamp) {
          merged.subscriptionEndsAt = updates.subscriptionEndsAt.toDate().toISOString()
        }
        if (typeof updates.deviceFingerprint === 'string') {
          merged.deviceFingerprint = updates.deviceFingerprint
        }
        return parseUserDoc(merged)
      }
      return existing
    }

    const publicId = generatePublicId()
    const now = Date.now()
    const subscriptionEndsAt = Timestamp.fromMillis(now + TRIAL_DURATION_MS)

    const payload: Record<string, unknown> = {
      completedOrdersCount: 0,
      isSubscribed: false,
      subscriptionEndsAt,
      publicId,
      createdAt: Timestamp.fromMillis(now),
    }
    if (deviceFingerprint) payload.deviceFingerprint = deviceFingerprint

    await setDoc(usersRef(uid), payload)

    return {
      completedOrdersCount: 0,
      isSubscribed: false,
      trialEndsAt: null,
      subscriptionEndsAt: subscriptionEndsAt.toDate().toISOString(),
      publicId,
      deviceFingerprint: deviceFingerprint ?? null,
    }
  } catch (e) {
    // Firestore offline / permission denied — don't block Google sign-in.
    if (__DEV__) console.warn('[DriveMind] ensureUserDoc failed, using local defaults', e)
    return defaultNewUser(deviceFingerprint)
  }
}

// ─── Session sync ─────────────────────────────────────────────────────────────

/** @deprecated Only sets trialEndsAt when the order count hits 10.  Kept for legacy callers. */
async function maybeStartLegacyTrial(uid: string, user: FirestoreUser): Promise<FirestoreUser> {
  if (user.trialEndsAt != null) return user
  if (user.completedOrdersCount < TRIAL_ORDER_THRESHOLD) return user

  const trialEndsAt = Timestamp.fromMillis(Date.now() + TRIAL_DURATION_MS)
  await updateDoc(usersRef(uid), { trialEndsAt })
  return { ...user, trialEndsAt: trialEndsAt.toDate().toISOString() }
}

export async function syncUserSession(
  uid: string,
  deviceFingerprint?: string | null,
): Promise<{
  user: FirestoreUser
  mode: PaywallMode
  blocked: boolean
  searchBlocked: boolean
}> {
  let user = await ensureUserDoc(uid, deviceFingerprint)
  try {
    user = await maybeStartLegacyTrial(uid, user)
  } catch {
    /* non-critical legacy trial back-fill */
  }
  const { mode, blocked, searchBlocked } = evaluatePaywallState(user)
  syncOrderParsingGate(user)
  return { user, mode, blocked, searchBlocked }
}

export function applyUserSessionToStore(
  uid: string,
  user: FirestoreUser,
  mode: PaywallMode,
  blocked: boolean,
  searchBlocked: boolean,
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
  })
  syncOrderParsingGate(user)
}

// ─── Order completion notifications ──────────────────────────────────────────

export async function recordOrderCompleted(uid: string): Promise<FirestoreUser | null> {
  const ref = usersRef(uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null

  const current = parseUserDoc(snap.data())
  if (current.completedOrdersCount >= TRIAL_ORDER_THRESHOLD) return current

  const nextCount = current.completedOrdersCount + 1
  const updates: Record<string, unknown> = { completedOrdersCount: increment(1) }

  // Legacy: set trialEndsAt when order limit is first hit (kept for compatibility)
  if (nextCount >= TRIAL_ORDER_THRESHOLD && current.trialEndsAt == null) {
    updates.trialEndsAt = Timestamp.fromMillis(Date.now() + TRIAL_DURATION_MS)
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
    const { mode, blocked, searchBlocked } = evaluatePaywallState(updated)
    applyUserSessionToStore(firebaseUid, updated, mode, blocked, searchBlocked)
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
