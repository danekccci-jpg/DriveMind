import { Platform } from 'react-native'

const WEB_CLIENT_ID = '1042575792605-04pgdgjmv7ulc3rjff4sc8qv8lphlnhr.apps.googleusercontent.com'

let configured = false

function getNativeModule() {
  // Lazy require keeps web bundles from resolving native code at graph build time.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin')
}

/** Call once at app startup (native). Uses webClientId for server-side token verification on Android. */
export function configureGoogleSignIn(): void {
  if (Platform.OS === 'web') return
  const { GoogleSignin } = getNativeModule()
  if (configured) return
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    offlineAccess: false,
  })
  configured = true
}

export async function signInWithGoogle(): Promise<{ name: string; email: string } | null> {
  if (Platform.OS === 'web') return null
  const { GoogleSignin, isSuccessResponse } = getNativeModule()
  configureGoogleSignIn()
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
  const response = await GoogleSignin.signIn()
  if (isSuccessResponse(response)) {
    const u = response.data.user
    return { name: u.name ?? '', email: u.email ?? '' }
  }
  return null
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

export { WEB_CLIENT_ID }
