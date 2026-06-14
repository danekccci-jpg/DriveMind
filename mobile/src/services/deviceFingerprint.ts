/**
 * Persistent device fingerprint — a secure random UUID generated on first launch
 * and stored in expo-secure-store (Android Keystore-backed SharedPreferences).
 *
 * Survives: app cache/data wipes, AsyncStorage clears.
 * Does NOT survive: app uninstall (Android Keystore clears on uninstall).
 *
 * Falls back to AsyncStorage when SecureStore is unavailable (simulator, API < 23).
 * Falls back to an in-process ephemeral UUID when both fail.
 *
 * Use `getOrCreateDeviceFingerprint()` once during app init and store the result
 * in authStore.  All subsequent callers can use `getCachedDeviceFingerprint()`
 * for a synchronous read.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { generateUUIDv4 } from '../utils/secureRandom'

const SECURE_KEY = 'dm_device_fp_v1'
const FALLBACK_KEY = 'dm_device_fp_fallback_v1'

let cached: string | null = null

/** Returns a stable device UUID, initialising it on first call. */
export async function getOrCreateDeviceFingerprint(): Promise<string> {
  if (cached) return cached

  // ── Try expo-secure-store (survives cache wipes) ──────────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store')
    const existing = await SecureStore.getItemAsync(SECURE_KEY)
    if (existing) {
      cached = existing
      return existing
    }
    const id = generateUUIDv4()
    await SecureStore.setItemAsync(SECURE_KEY, id)
    cached = id
    return id
  } catch {
    /* SecureStore unavailable — fall through */
  }

  // ── Fall back to AsyncStorage ─────────────────────────────────────────────
  try {
    const existing = await AsyncStorage.getItem(FALLBACK_KEY)
    if (existing) {
      cached = existing
      return existing
    }
    const id = generateUUIDv4()
    await AsyncStorage.setItem(FALLBACK_KEY, id)
    cached = id
    return id
  } catch {
    /* AsyncStorage unavailable — fall through */
  }

  // ── Last resort: ephemeral (process-scoped only) ──────────────────────────
  try {
    const id = generateUUIDv4()
    cached = id
    return id
  } catch {
    const id = `dm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    cached = id
    return id
  }
}

/**
 * Synchronously returns the cached fingerprint if `getOrCreateDeviceFingerprint`
 * has already been awaited.  Returns `null` before initialisation.
 */
export function getCachedDeviceFingerprint(): string | null {
  return cached
}
