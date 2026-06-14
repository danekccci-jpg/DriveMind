import { NativeModules, Platform } from 'react-native'

import { useAccessibilityDisclosureStore } from '../store/accessibilityDisclosureStore'

type DriveMindNativeType = {
  isAccessibilityServiceEnabled?: () => Promise<boolean>
  getServiceStatuses: () => Promise<{ accessibilityServiceEnabled: boolean }>
  openAccessibilitySettings?: () => void
}

function getNative(): DriveMindNativeType | null {
  if (Platform.OS !== 'android') return null
  return (NativeModules.DriveMindNative as DriveMindNativeType | undefined) ?? null
}

/**
 * Checks whether the DriveMind Accessibility Service is currently active.
 *
 * Returns `true` when the Prominent Disclosure screen MUST be shown
 * (i.e. the service is disabled), `false` when the service is already
 * active and the user can proceed directly.
 */
export async function checkAndRequestAccessibility(): Promise<boolean> {
  const native = getNative()
  if (!native) return false

  try {
    let enabled: boolean
    if (typeof native.isAccessibilityServiceEnabled === 'function') {
      enabled = await native.isAccessibilityServiceEnabled()
    } else {
      const statuses = await native.getServiceStatuses()
      enabled = statuses.accessibilityServiceEnabled
    }
    return !enabled
  } catch (e) {
    if (__DEV__) console.warn('[DriveMind] checkAndRequestAccessibility failed', e)
    return false
  }
}

/**
 * Opens the Android system Accessibility Settings screen so the user
 * can enable the DriveMind Accessibility Service.
 *
 * Call only after the user has accepted the prominent disclosure, or when
 * the service is already enabled (manage flow).
 */
export function openAccessibilitySettings(): void {
  const native = getNative()
  if (!native) return
  try {
    if (typeof native.openAccessibilitySettings === 'function') {
      native.openAccessibilitySettings()
    }
  } catch (e) {
    if (__DEV__) console.warn('[DriveMind] openAccessibilitySettings failed', e)
  }
}

export type AccessibilitySettingsPromptResult = 'opened' | 'cancelled' | 'already-enabled'

/**
 * Shows the prominent disclosure before opening Accessibility Settings when the
 * service is disabled. If already enabled, opens settings directly (manage flow).
 */
let accessibilityPromptInFlight = false

export async function promptAccessibilitySettingsWithDisclosure(): Promise<AccessibilitySettingsPromptResult> {
  if (Platform.OS !== 'android') return 'already-enabled'
  if (accessibilityPromptInFlight) return 'cancelled'

  const needsDisclosure = await checkAndRequestAccessibility()
  if (!needsDisclosure) {
    // Service already enabled — open settings only on explicit user action elsewhere.
    return 'already-enabled'
  }

  accessibilityPromptInFlight = true

  try {
    const result = await useAccessibilityDisclosureStore.getState().requestDisclosure()
    if (result === 'accepted') {
      openAccessibilitySettings()
      return 'opened'
    }
    return 'cancelled'
  } finally {
    accessibilityPromptInFlight = false
  }
}

/**
 * Shift start flow: disclosure when a11y is off; returns whether the caller may proceed.
 * On accept, opens system settings (user may enable the service there).
 */
export async function requestShiftAccessibilityDisclosure(): Promise<boolean> {
  if (Platform.OS !== 'android') return true

  const needsDisclosure = await checkAndRequestAccessibility()
  if (!needsDisclosure) return true

  const result = await useAccessibilityDisclosureStore.getState().requestDisclosure()
  if (result === 'accepted') {
    openAccessibilitySettings()
    return true
  }
  return false
}
