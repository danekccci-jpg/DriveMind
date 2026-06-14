import { NativeModules, Platform } from 'react-native'
import {
  checkBackgroundLocationGranted,
  checkLocationWhenInUseGranted,
  checkNotificationPermissionGranted,
  resetSafePermissionSession,
  safeRequestLocationWhenInUse,
  safeRequestNotificationPermission,
} from '../utils/safePermissions'

export type PermissionStatusSnapshot = {
  locationGranted: boolean
  notificationsGranted: boolean
  overlayGranted: boolean | null
  accessibilityGranted: boolean | null
  usageStatsGranted: boolean | null
}

/** Permissions required before order ingest can work on the map screen. */
export type CoreIngestPermissionSnapshot = {
  notificationListenerGranted: boolean
  backgroundLocationGranted: boolean
  allGranted: boolean
}

type ServiceStatuses = {
  notificationListenerEnabled: boolean
  accessibilityServiceEnabled: boolean
  ignoringBatteryOptimizations: boolean
}

type DriveMindNativeType = {
  isOverlayPermissionGranted: () => Promise<boolean>
  requestOverlayPermission?: () => void
  openAccessibilitySettings?: () => void
  getServiceStatuses: () => Promise<ServiceStatuses>
  isAccessibilityServiceEnabled?: () => Promise<boolean>
  isUsageAccessGranted: () => Promise<boolean>
  /** Authoritative native ingest readiness (notification listener + location). */
  isBridgeActive?: () => Promise<boolean>
}

function getNative(): DriveMindNativeType | null {
  if (Platform.OS !== 'android') return null
  return (NativeModules.DriveMindNative as DriveMindNativeType | undefined) ?? null
}

async function readNativeServiceStatuses(
  native: DriveMindNativeType,
): Promise<Pick<PermissionStatusSnapshot, 'overlayGranted' | 'accessibilityGranted' | 'usageStatsGranted'>> {
  try {
    const [overlayGranted, usageStatsGranted, statuses] = await Promise.all([
      native.isOverlayPermissionGranted(),
      native.isUsageAccessGranted(),
      native.getServiceStatuses(),
    ])
    return {
      overlayGranted,
      usageStatsGranted,
      accessibilityGranted: statuses.accessibilityServiceEnabled,
    }
  } catch (e) {
    console.warn('[DriveMind] readNativeServiceStatuses', e)
    return { overlayGranted: null, accessibilityGranted: null, usageStatsGranted: null }
  }
}

async function checkNotificationListenerGranted(): Promise<boolean> {
  const native = getNative()
  if (!native) return true
  try {
    const statuses = await native.getServiceStatuses()
    return statuses.notificationListenerEnabled
  } catch (e) {
    console.warn('[DriveMind] checkNotificationListenerGranted', e)
    return false
  }
}

/**
 * Real-time gate for the permissions onboarding modal (notification listener + background GPS).
 * Never opens system dialogs.
 */
export async function checkCoreIngestPermissions(): Promise<CoreIngestPermissionSnapshot> {
  if (Platform.OS !== 'android') {
    return {
      notificationListenerGranted: true,
      backgroundLocationGranted: true,
      allGranted: true,
    }
  }

  const [notificationListenerGranted, backgroundLocationGranted] = await Promise.all([
    checkNotificationListenerGranted(),
    checkBackgroundLocationGranted(),
  ])

  const snapshot: CoreIngestPermissionSnapshot = {
    notificationListenerGranted,
    backgroundLocationGranted,
    allGranted: notificationListenerGranted && backgroundLocationGranted,
  }

  if (__DEV__) {
    console.log('[DriveMind] checkCoreIngestPermissions', snapshot)
  }

  return snapshot
}

/**
 * Native-authoritative gate for permission onboarding / disclosure overlays.
 * Prefer this over JS-only checks on cold start when react-native-permissions
 * may report stale values while the OS already granted access.
 */
export async function isNativeIngestBridgeActive(): Promise<boolean> {
  if (Platform.OS !== 'android') return true

  const native = getNative()
  if (!native) return false

  try {
    if (typeof native.isBridgeActive === 'function') {
      return await native.isBridgeActive()
    }
  } catch (e) {
    console.warn('[DriveMind] isBridgeActive native call failed', e)
  }

  const snapshot = await checkCoreIngestPermissions()
  return snapshot.allGranted
}

/**
 * Read-only permission audit — never opens dialogs or system settings.
 * Call on app start and when returning from Settings (AppState active).
 */
export async function checkPermissionsStatus(): Promise<PermissionStatusSnapshot> {
  const [locationGranted, notificationsGranted] = await Promise.all([
    checkLocationWhenInUseGranted(),
    checkNotificationPermissionGranted(),
  ])

  const native = getNative()
  const nativeStatuses = native
    ? await readNativeServiceStatuses(native)
    : { overlayGranted: null, accessibilityGranted: null, usageStatsGranted: null }

  const snapshot: PermissionStatusSnapshot = {
    locationGranted,
    notificationsGranted,
    ...nativeStatuses,
  }

  if (__DEV__) {
    console.log('[DriveMind] checkPermissionsStatus', snapshot)
  }

  return snapshot
}

/**
 * Runtime permission prompts — call only from explicit user actions (e.g. "Allow" button).
 * Does not open overlay / accessibility / usage settings.
 */
export async function requestRuntimePermissionsOnUserAction(): Promise<PermissionStatusSnapshot> {
  if (Platform.OS !== 'web') {
    await safeRequestLocationWhenInUse()
    await safeRequestNotificationPermission()
  }
  return checkPermissionsStatus()
}

/** User opened system Settings manually — allow a fresh runtime request attempt. */
export function onReturnedFromSystemSettings(): void {
  resetSafePermissionSession()
}

/**
 * @deprecated Use checkPermissionsStatus on startup and requestRuntimePermissionsOnUserAction on button press.
 */
export async function requestAllPermissions(): Promise<void> {
  await checkPermissionsStatus()
}
