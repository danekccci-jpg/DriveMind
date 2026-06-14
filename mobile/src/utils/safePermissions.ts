import { Platform } from 'react-native'
import {
  check,
  checkNotifications,
  request,
  requestNotifications,
  PERMISSIONS,
  RESULTS,
  type Permission,
} from 'react-native-permissions'

const MAX_RETRIES = 1

/** In-flight promises — prevents parallel duplicate requests for the same key. */
const activePermissionRequests = new Map<string, Promise<boolean>>()

/** Keys that were already requested this session (granted or denied) — no second prompt. */
const hasRequestedPermission = new Set<string>()

function permKey(permission: Permission | string): string {
  return String(permission)
}

/**
 * Safe runtime permission request — at most one attempt per key per session.
 * Skips when already in-flight, already requested, or already granted.
 */
export async function safeRequestPermission(
  permission: Permission,
  options: { maxRetries?: number } = {},
): Promise<boolean> {
  const maxRetries = options.maxRetries ?? MAX_RETRIES
  const key = permKey(permission)

  if (hasRequestedPermission.has(key)) {
    if (__DEV__) console.log(`[SafePerm] Permission ${key} already requested, skipping`)
    const current = await check(permission)
    return current === RESULTS.GRANTED
  }

  const inFlight = activePermissionRequests.get(key)
  if (inFlight) {
    if (__DEV__) console.log(`[SafePerm] Request ${key} already in progress, skipping`)
    return inFlight
  }

  const promise = (async (): Promise<boolean> => {
    try {
      const current = await check(permission)
      if (current === RESULTS.GRANTED) return true
      if (current === RESULTS.BLOCKED || current === RESULTS.UNAVAILABLE) {
        hasRequestedPermission.add(key)
        return false
      }

      let attempts = 0
      while (attempts < maxRetries) {
        attempts += 1
        hasRequestedPermission.add(key)
        const result = await request(permission)
        if (result === RESULTS.GRANTED) return true
        if (result === RESULTS.BLOCKED || result === RESULTS.UNAVAILABLE) return false
      }
      return false
    } finally {
      activePermissionRequests.delete(key)
    }
  })()

  activePermissionRequests.set(key, promise)
  return promise
}

/** Check-only — never shows a system dialog. */
export async function checkPermissionGranted(permission: Permission): Promise<boolean> {
  const current = await check(permission)
  return current === RESULTS.GRANTED
}

/** POST_NOTIFICATIONS — safe request, one attempt per session. */
export async function safeRequestNotificationPermission(): Promise<boolean> {
  const key = 'notifications'

  if (hasRequestedPermission.has(key)) {
    if (__DEV__) console.log('[SafePerm] Notification permission already requested, skipping')
    const { status } = await checkNotifications()
    return status === RESULTS.GRANTED || status === RESULTS.LIMITED
  }

  const inFlight = activePermissionRequests.get(key)
  if (inFlight) return inFlight

  const promise = (async (): Promise<boolean> => {
    try {
      const { status } = await checkNotifications()
      if (status === RESULTS.GRANTED || status === RESULTS.LIMITED) return true
      if (status === RESULTS.BLOCKED || status === RESULTS.UNAVAILABLE) {
        hasRequestedPermission.add(key)
        return false
      }

      hasRequestedPermission.add(key)
      const result = await requestNotifications(
        Platform.OS === 'ios' ? ['alert', 'badge', 'sound'] : undefined,
      )
      return result.status === RESULTS.GRANTED || result.status === RESULTS.LIMITED
    } finally {
      activePermissionRequests.delete(key)
    }
  })()

  activePermissionRequests.set(key, promise)
  return promise
}

export async function checkNotificationPermissionGranted(): Promise<boolean> {
  const { status } = await checkNotifications()
  return status === RESULTS.GRANTED || status === RESULTS.LIMITED
}

export async function safeRequestLocationWhenInUse(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    return safeRequestPermission(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE)
  }
  if (Platform.OS === 'android') {
    return safeRequestPermission(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION)
  }
  return true
}

export async function checkLocationWhenInUseGranted(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    return checkPermissionGranted(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE)
  }
  if (Platform.OS === 'android') {
    return checkPermissionGranted(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION)
  }
  return true
}

/** Android background location — required for shift GPS while app is backgrounded. */
export async function checkBackgroundLocationGranted(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    return checkPermissionGranted(PERMISSIONS.IOS.LOCATION_ALWAYS)
  }
  if (Platform.OS === 'android') {
    const fine = await checkPermissionGranted(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION)
    if (!fine) return false
    const bg = await check(PERMISSIONS.ANDROID.ACCESS_BACKGROUND_LOCATION)
    if (bg === RESULTS.UNAVAILABLE) return fine
    return bg === RESULTS.GRANTED
  }
  return true
}

/** After user returns from system Settings — allow one fresh request attempt. */
export function resetSafePermissionSession(): void {
  hasRequestedPermission.clear()
  activePermissionRequests.clear()
}
