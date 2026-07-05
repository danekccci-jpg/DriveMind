import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import {
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
} from 'firebase/auth'

import { getFirebaseAuth } from '../config/firebase'
import i18n from '../i18n'
import { useAuthStore } from '../store/authStore'
import {
  syncUserSession,
  type FirestoreUser,
  type PaywallMode,
} from './userFirestoreService'
import { syncOrderParsingGate } from './subscriptionGate'
import { getOrCreateDeviceFingerprint } from './deviceFingerprint'
import { isDeviceLinkedToOtherUid, linkUidToDevice } from './deviceFingerprintFirestore'

const EMAIL_STORAGE_KEY = 'drivemind_email_for_signin'
const BUNDLE_ID = 'com.guessxx.drivemind'
const DEEP_LINK_URL = 'https://drivemind-d4994.firebaseapp.com/login'

/** Firebase email-link sign-in supports en/pl/ru (uk falls back to en). */
function resolveFirebaseAuthLanguage(): string {
  const raw = (i18n.language || 'en').split('-')[0]
  if (raw === 'pl' || raw === 'ru') return raw
  return 'en'
}

export type EmailLinkSendResult =
  | { kind: 'link_sent' }
  | { kind: 'error'; error: unknown }

export type EmailLinkSignInResult =
  | {
      kind: 'success'
      name: string
      email: string
      uid: string
      userRecord: FirestoreUser
      paywallMode: PaywallMode
      paywallRequired: boolean
      searchBlocked: boolean
      remainingTrips: number
    }
  | { kind: 'error'; error: unknown }

export async function sendEmailLink(email: string): Promise<EmailLinkSendResult> {
  try {
    const auth = getFirebaseAuth()
    auth.languageCode = resolveFirebaseAuthLanguage()
    const trimmed = email.trim()
    const actionCodeSettings = {
      url: DEEP_LINK_URL,
      handleCodeInApp: true,
      ...(Platform.OS === 'ios'
        ? { iOS: { bundleId: BUNDLE_ID } }
        : {
            android: {
              packageName: BUNDLE_ID,
              installApp: true,
              minimumVersion: '1',
            },
          }),
    }
    await sendSignInLinkToEmail(auth, trimmed, actionCodeSettings)
    await AsyncStorage.setItem(EMAIL_STORAGE_KEY, trimmed)
    return { kind: 'link_sent' }
  } catch (error) {
    return { kind: 'error', error }
  }
}

export function isEmailSignInLink(url: string): boolean {
  try {
    return isSignInWithEmailLink(getFirebaseAuth(), url)
  } catch {
    return false
  }
}

export async function handleEmailLinkSignIn(url: string): Promise<EmailLinkSignInResult> {
  try {
    const auth = getFirebaseAuth()
    const email = await AsyncStorage.getItem(EMAIL_STORAGE_KEY)
    if (!email) {
      return { kind: 'error', error: new Error('No email stored for sign-in link') }
    }

    const userCred = await signInWithEmailLink(auth, email, url)
    const uid = userCred.user.uid
    const userEmail = userCred.user.email ?? email

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

    const session = await syncUserSession(uid, userEmail, fingerprint ?? undefined)
    await AsyncStorage.removeItem(EMAIL_STORAGE_KEY)

    const paywallRequired = session.blocked || isAbuse
    const searchBlocked = session.searchBlocked || isAbuse
    const paywallMode: PaywallMode = isAbuse ? 'expired' : session.mode

    return {
      kind: 'success',
      name: userEmail.split('@')[0],
      email: userEmail,
      uid,
      userRecord: session.user,
      paywallMode,
      paywallRequired,
      searchBlocked,
      remainingTrips: session.remainingTrips,
    }
  } catch (error) {
    return { kind: 'error', error }
  }
}

export async function completeEmailLinkAuth(
  result: Extract<EmailLinkSignInResult, { kind: 'success' }>,
): Promise<void> {
  const store = useAuthStore.getState()
  store.setUser(result.name, result.email)
  store.setSubscription({
    firebaseUid: result.uid,
    completedOrdersCount: result.userRecord.completedOrdersCount,
    isSubscribed: result.userRecord.isSubscribed,
    trialEndsAt: result.userRecord.trialEndsAt,
    subscriptionEndsAt: result.userRecord.subscriptionEndsAt,
    publicId: result.userRecord.publicId,
    paywallMode: result.paywallMode,
    isPaywallBlocked: result.paywallRequired,
    isSearchBlocked: result.searchBlocked,
    remainingTrips: result.remainingTrips,
  })
  syncOrderParsingGate()
}
