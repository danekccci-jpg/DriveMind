import Constants from 'expo-constants'
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getFirestore, type Firestore } from 'firebase/firestore'
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

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId)
}
