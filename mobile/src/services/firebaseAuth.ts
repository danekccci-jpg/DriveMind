import {
  GoogleAuthProvider,
  deleteUser,
  onAuthStateChanged,
  signInWithCredential,
  signOut,
  type User,
} from 'firebase/auth'

import { getFirebaseAuth } from '../config/firebase'
import {
  applyUserSessionToStore,
  deleteUserFirestoreDoc,
  syncUserSession,
  type FirestoreUser,
  type PaywallMode,
} from './userFirestoreService'
import { signInWithGoogle, signOutGoogle, type GoogleSignInResult } from './googleAuth'
import { getOrCreateDeviceFingerprint } from './deviceFingerprint'
import {
  linkUidToDevice,
  isDeviceLinkedToOtherUid,
} from './deviceFingerprintFirestore'
import { useAuthStore } from '../store/authStore'

export type FirebaseSignInResult =
  | {
      kind: 'success'
      name: string
      email: string
      uid: string
      userRecord: FirestoreUser
      paywallMode: PaywallMode
      paywallRequired: boolean
      searchBlocked: boolean
    }
  | { kind: 'cancelled' }
  | { kind: 'error'; error: unknown }

export async function signInWithGoogleAndEnsureUser(): Promise<FirebaseSignInResult> {
  const google: GoogleSignInResult = await signInWithGoogle()
  if (google.kind !== 'success') {
    return google.kind === 'cancelled'
      ? { kind: 'cancelled' }
      : { kind: 'error', error: google.error }
  }
  if (!google.idToken) {
    return { kind: 'error', error: new Error('Google sign-in did not return an id token') }
  }

  try {
    const auth = getFirebaseAuth()
    const credential = GoogleAuthProvider.credential(google.idToken)
    const userCred = await signInWithCredential(auth, credential)
    const uid = userCred.user.uid

    // ── Anti-abuse: device fingerprint check (non-blocking on failure) ────────
    let fingerprint: string | null = useAuthStore.getState().deviceFingerprint
    let isAbuse = false
    try {
      fingerprint = await getOrCreateDeviceFingerprint()
      useAuthStore.getState().setDeviceFingerprint(fingerprint)
      isAbuse = await isDeviceLinkedToOtherUid(fingerprint, uid)
      void linkUidToDevice(fingerprint, uid)
    } catch (fpError) {
      if (__DEV__) console.warn('[DriveMind] device fingerprint step failed', fpError)
    }

    // Sync the Firestore user document (creates it if missing, back-fills publicId
    // and subscriptionEndsAt for older accounts). ensureUserDoc never throws.
    const session = await syncUserSession(uid, fingerprint ?? undefined)

    // Abuse detected: override the paywall state to force subscription
    const paywallRequired = session.blocked || isAbuse
    const searchBlocked = session.searchBlocked || isAbuse
    const paywallMode: PaywallMode = isAbuse ? 'expired' : session.mode

    return {
      kind: 'success',
      name: google.name || google.email.split('@')[0],
      email: google.email,
      uid,
      userRecord: session.user,
      paywallMode,
      paywallRequired,
      searchBlocked,
    }
  } catch (error) {
    return { kind: 'error', error }
  }
}

export async function syncCurrentUserSubscription(): Promise<{
  uid: string
  userRecord: FirestoreUser
  paywallMode: PaywallMode
  paywallRequired: boolean
  searchBlocked: boolean
} | null> {
  const auth = getFirebaseAuth()
  const firebaseUser = auth.currentUser
  if (!firebaseUser) return null

  const fingerprint = useAuthStore.getState().deviceFingerprint
  const session = await syncUserSession(firebaseUser.uid, fingerprint ?? undefined)
  applyUserSessionToStore(
    firebaseUser.uid,
    session.user,
    session.mode,
    session.blocked,
    session.searchBlocked,
  )
  return {
    uid: firebaseUser.uid,
    userRecord: session.user,
    paywallMode: session.mode,
    paywallRequired: session.blocked,
    searchBlocked: session.searchBlocked,
  }
}

export function waitForFirebaseAuthUser(): Promise<User | null> {
  const auth = getFirebaseAuth()
  if (auth.currentUser) return Promise.resolve(auth.currentUser)
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub()
      resolve(user)
    })
  })
}

export async function signOutFirebase(): Promise<void> {
  await signOutGoogle()
  try {
    await signOut(getFirebaseAuth())
  } catch {
    /* noop */
  }
}

export type DeleteUserAccountResult =
  | { kind: 'success' }
  | { kind: 'requires-recent-login' }
  | { kind: 'not-signed-in' }
  | { kind: 'error'; error: unknown }

function isRequiresRecentLoginError(error: unknown): boolean {
  return (error as { code?: string } | undefined)?.code === 'auth/requires-recent-login'
}

export async function deleteUserAccount(): Promise<DeleteUserAccountResult> {
  const auth = getFirebaseAuth()
  const user = auth.currentUser
  if (!user) return { kind: 'not-signed-in' }

  const uid = user.uid
  try {
    await deleteUserFirestoreDoc(uid)
    await deleteUser(user)
    await signOutGoogle()
    return { kind: 'success' }
  } catch (error) {
    if (isRequiresRecentLoginError(error)) {
      return { kind: 'requires-recent-login' }
    }
    if (__DEV__) console.warn('[DriveMind] deleteUserAccount failed', error)
    return { kind: 'error', error }
  }
}
