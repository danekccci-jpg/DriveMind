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

import { getFirestoreDb } from '../config/firebase'
import { useAuthStore, isGuestEmail } from '../store/authStore'
import { syncOrderParsingGate } from './subscriptionGate'

export const USERS_COLLECTION = 'users'
export const TRIAL_ORDER_THRESHOLD = 10
const TRIAL_MS = 7 * 24 * 60 * 60 * 1000

export type PaywallMode = 'none' | 'onboarding' | 'expired'

export interface FirestoreUser {
  completedOrdersCount: number
  isSubscribed: boolean
  trialEndsAt: string | null
}

function usersRef(uid: string) {
  return doc(getFirestoreDb(), USERS_COLLECTION, uid)
}

function parseTrialEndsAt(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const secs = (value as { seconds: number }).seconds
    return new Date(secs * 1000).toISOString()
  }
  return null
}

function parseUserDoc(data: DocumentData): FirestoreUser {
  return {
    completedOrdersCount: typeof data.completedOrdersCount === 'number' ? data.completedOrdersCount : 0,
    isSubscribed: data.isSubscribed === true,
    trialEndsAt: parseTrialEndsAt(data.trialEndsAt),
  }
}

export function isSearchBlocked(user: FirestoreUser): boolean {
  return !user.isSubscribed && user.completedOrdersCount >= TRIAL_ORDER_THRESHOLD
}

export function evaluatePaywallState(user: FirestoreUser): {
  mode: PaywallMode
  blocked: boolean
  searchBlocked: boolean
} {
  const searchBlocked = isSearchBlocked(user)
  if (user.isSubscribed) return { mode: 'none', blocked: false, searchBlocked: false }

  const trialEndMs = user.trialEndsAt ? new Date(user.trialEndsAt).getTime() : null
  if (trialEndMs != null && Number.isFinite(trialEndMs) && Date.now() > trialEndMs) {
    return { mode: 'expired', blocked: true, searchBlocked: true }
  }

  if (searchBlocked) {
    return { mode: 'onboarding', blocked: false, searchBlocked: true }
  }

  return { mode: 'none', blocked: false, searchBlocked: false }
}

async function maybeStartTrial(uid: string, user: FirestoreUser): Promise<FirestoreUser> {
  if (user.trialEndsAt != null) return user
  if (user.completedOrdersCount < TRIAL_ORDER_THRESHOLD) return user

  const trialEndsAt = Timestamp.fromMillis(Date.now() + TRIAL_MS)
  await updateDoc(usersRef(uid), { trialEndsAt })
  return { ...user, trialEndsAt: trialEndsAt.toDate().toISOString() }
}

export async function deleteUserFirestoreDoc(uid: string): Promise<void> {
  await deleteDoc(usersRef(uid))
}

export async function fetchUserDoc(uid: string): Promise<FirestoreUser | null> {
  const snap = await getDoc(usersRef(uid))
  if (!snap.exists()) return null
  return parseUserDoc(snap.data())
}

export async function ensureUserDoc(uid: string): Promise<FirestoreUser> {
  const existing = await fetchUserDoc(uid)
  if (existing) return existing

  const initial: FirestoreUser = {
    completedOrdersCount: 0,
    isSubscribed: false,
    trialEndsAt: null,
  }
  await setDoc(usersRef(uid), {
    completedOrdersCount: 0,
    isSubscribed: false,
    trialEndsAt: null,
  })
  return initial
}

export async function syncUserSession(uid: string): Promise<{
  user: FirestoreUser
  mode: PaywallMode
  blocked: boolean
  searchBlocked: boolean
}> {
  let user = await ensureUserDoc(uid)
  user = await maybeStartTrial(uid, user)
  const { mode, blocked, searchBlocked } = evaluatePaywallState(user)
  syncOrderParsingGate(user)
  return { user, mode, blocked, searchBlocked }
}

export async function recordOrderCompleted(uid: string): Promise<FirestoreUser | null> {
  const ref = usersRef(uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null

  const current = parseUserDoc(snap.data())
  if (current.completedOrdersCount >= TRIAL_ORDER_THRESHOLD) {
    return current
  }

  const nextCount = current.completedOrdersCount + 1
  const updates: Record<string, unknown> = {
    completedOrdersCount: increment(1),
  }
  if (nextCount >= TRIAL_ORDER_THRESHOLD && current.trialEndsAt == null) {
    updates.trialEndsAt = Timestamp.fromMillis(Date.now() + TRIAL_MS)
  }
  await updateDoc(ref, updates)

  const updated = await fetchUserDoc(uid)
  return updated
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
    paywallMode: mode,
    isPaywallBlocked: blocked,
    isSearchBlocked: searchBlocked,
  })
  syncOrderParsingGate(user)
}

export async function notifyOrderCompletedForUser(): Promise<void> {
  const { firebaseUid, userEmail } = useAuthStore.getState()
  if (!firebaseUid || isGuestEmail(userEmail)) return

  try {
    const updated = await recordOrderCompleted(firebaseUid)
    if (!updated) return
    const { mode, blocked, searchBlocked } = evaluatePaywallState(updated)
    applyUserSessionToStore(firebaseUid, updated, mode, blocked, searchBlocked)
  } catch (e) {
    if (__DEV__) console.warn('[DriveMind] notifyOrderCompletedForUser failed', e)
  }
}
