import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { devLog, devWarn, devError } from '../utils/logger'

function getWebClientId(): string {
  return (
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
    (Constants.expoConfig?.extra as { googleWebClientId?: string } | undefined)?.googleWebClientId ??
    ''
  ).trim()
}

let configured = false

function getNativeModule() {
  // Lazy require keeps web bundles from resolving native code at graph build time.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin')
}

/** Call once at app startup (native). `webClientId` must be the OAuth "Web application" client id. */
export function configureGoogleSignIn(): void {
  if (Platform.OS === 'web') return
  const { GoogleSignin } = getNativeModule()
  if (configured) return
  const webClientId = getWebClientId()
  if (!webClientId) {
    devWarn('[DriveMind] Google Sign-In: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set')
    return
  }
  GoogleSignin.configure({
    webClientId,
    // No backend token exchange in this app — avoids extra serverAuthCode requirements.
    offlineAccess: false,
  })
  configured = true
}

function logGoogleSignInError(e: unknown): void {
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>
    devLog('[DriveMind] GoogleSignIn error.code:', o.code)
    devLog('[DriveMind] GoogleSignIn error.message:', o.message)
    try {
      devLog('[DriveMind] GoogleSignIn error (JSON):', JSON.stringify(e, Object.getOwnPropertyNames(e as object)))
    } catch {
      devLog('[DriveMind] GoogleSignIn error (object):', e)
    }
  } else {
    devLog('[DriveMind] GoogleSignIn error:', e)
  }
}

/** Result of `signInWithGoogle` — use `kind` so UI can ignore cancel vs show errors. */
export type GoogleSignInResult =
  | { kind: 'success'; name: string; email: string; idToken: string | null }
  | { kind: 'cancelled' }
  | { kind: 'error'; error: unknown }

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  if (Platform.OS === 'web') {
    return { kind: 'error', error: new Error('Google sign-in is not available on web') }
  }
  const { GoogleSignin, isSuccessResponse, isCancelledResponse } = getNativeModule()
  configureGoogleSignIn()
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
    const response = await GoogleSignin.signIn()
    if (isCancelledResponse(response)) {
      return { kind: 'cancelled' }
    }
    if (isSuccessResponse(response)) {
      const u = response.data.user
      const email = (u.email ?? '').trim()
      if (!email) {
        devWarn('[DriveMind] Google sign-in: empty email in profile')
        return { kind: 'error', error: new Error('No email in Google profile') }
      }
      return { kind: 'success', name: u.name ?? '', email, idToken: response.data.idToken ?? null }
    }
    devWarn('[DriveMind] Google sign-in: unexpected response shape', response)
    return { kind: 'error', error: new Error('Unexpected Google sign-in response') }
  } catch (e) {
    const serialized =
      e && typeof e === 'object'
        ? JSON.stringify(e, Object.getOwnPropertyNames(e as object))
        : String(e)
    devError(`[DriveMind] GoogleSignIn full error: ${serialized} | String(e): ${String(e)}`)
    if (e && typeof e === 'object' && 'code' in e) {
      const code = (e as { code: unknown }).code
      if (code === 10 || code === '10' || code === 12500 || code === '12500') {
        // SHA-1 mismatch or Developer Console propagation delay.
      }
    }
    logGoogleSignInError(e)
    return { kind: 'error', error: e }
  }
}

export async function signOutGoogle(): Promise<void> {
  if (Platform.OS === 'web') return
  try {
    const { GoogleSignin } = getNativeModule()
    await GoogleSignin.signOut()
  } catch {
    /* ignore */
  }
}

export { getWebClientId as getGoogleWebClientId }

/** Android often surfaces misconfigured SHA-1 / OAuth client as DEVELOPER_ERROR (code 10). */
export function isGoogleSignInDeveloperError(e: unknown): boolean {
  if (e && typeof e === 'object' && 'code' in e) {
    const code = (e as { code: unknown }).code
    if (code === 'DEVELOPER_ERROR' || code === 10 || code === '10') return true
  }
  const s = e instanceof Error ? e.message : String(e)
  return s.includes('DEVELOPER_ERROR')
}

/** Append to Alert in __DEV__ so you can match adb / Console (code 10 = SHA-1 or OAuth client). */
export function formatGoogleSignInErrorDebug(e: unknown): string {
  if (!__DEV__) return ''
  if (!e || typeof e !== 'object') return `\n\n[debug] ${String(e)}`
  const o = e as Record<string, unknown>
  const code = o.code
  const message = o.message
  return `\n\n[debug] code=${String(code)} ${String(message ?? '')}`.trimEnd()
}
