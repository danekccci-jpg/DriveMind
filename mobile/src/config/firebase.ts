import Constants from 'expo-constants'
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions'
import { initializeAuth, getAuth, type Auth } from 'firebase/auth'
// @ts-expect-error — RN persistence entry ships with firebase/auth RN bundle
import { getReactNativePersistence } from 'firebase/auth'
import AsyncStorage from '@react-native-async-storage/async-storage'

type FirebaseExtra = {
  apiKey?: string
  authDomain?: string
  projectId?: string
  storageBucket?: string
  messagingSenderId?: string
  appId?: string
}

const extra = (Constants.expoConfig?.extra?.firebase ?? {}) as FirebaseExtra

export const firebaseConfig = {
  apiKey: extra.apiKey ?? '',
  authDomain: extra.authDomain ?? '',
  projectId: extra.projectId ?? '',
  storageBucket: extra.storageBucket ?? '',
  messagingSenderId: extra.messagingSenderId ?? '',
  appId: extra.appId ?? '',
}

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null
let functions: Functions | null = null

export function getFirebaseApp(): FirebaseApp {
  if (app) return app
  app = getApps().length > 0 ? getApps()[0]! : initializeApp(firebaseConfig)
  return app
}

export function getFirebaseAuth(): Auth {
  if (auth) return auth
  const firebaseApp = getFirebaseApp()
  try {
    auth = initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    })
  } catch {
    auth = getAuth(firebaseApp)
  }
  return auth
}

export function getFirestoreDb(): Firestore {
  if (db) return db
  db = getFirestore(getFirebaseApp())
  return db
}

/** Callable Functions client — region must match deployed `verifySubscription`. */
export function getFirebaseFunctions(): Functions {
  if (functions) return functions
  const region =
    (Constants.expoConfig?.extra as { firebaseFunctionsRegion?: string } | undefined)
      ?.firebaseFunctionsRegion ?? 'europe-central2'
  functions = getFunctions(getFirebaseApp(), region)
  if (__DEV__ && process.env.EXPO_PUBLIC_USE_FUNCTIONS_EMULATOR === '1') {
    connectFunctionsEmulator(functions, '127.0.0.1', 5001)
  }
  return functions
}

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId)
}
