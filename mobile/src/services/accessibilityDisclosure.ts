import { NativeModules, Platform } from 'react-native'

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
 * Returns `true` when the service is disabled, `false` when already enabled.
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
 * Opens the Android system settings so the user can enable the DriveMind
 * Accessibility Service. Uses a defensive native intent cascade.
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
 * Explicit Order Reader toggle — always fires settings intent instantly when disabled.
 * No disclosure modal on this path (cold-start auto-prompt handled separately).
 */
export async function openOrderReaderAccessibilityExplicit(): Promise<AccessibilitySettingsPromptResult> {
  if (Platform.OS !== 'android') return 'already-enabled'

  const needsSettings = await checkAndRequestAccessibility()
  if (!needsSettings) {
    return 'already-enabled'
  }

  openAccessibilitySettings()
  return 'opened'
}

/**
 * @deprecated Use openOrderReaderAccessibilityExplicit — same instant behavior.
 */
export async function promptAccessibilitySettingsWithDisclosure(): Promise<AccessibilitySettingsPromptResult> {
  return openOrderReaderAccessibilityExplicit()
}

/**
 * Shift start flow: open accessibility settings when service is disabled.
 */
export async function requestShiftAccessibilityDisclosure(): Promise<boolean> {
  if (Platform.OS !== 'android') return true

  const needsSettings = await checkAndRequestAccessibility()
  if (!needsSettings) return true

  openAccessibilitySettings()
  return true
}
