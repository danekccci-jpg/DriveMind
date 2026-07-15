import { NativeModules, Platform } from 'react-native'

import { useA11yServiceDisclosureStore } from '../store/a11yServiceDisclosureStore'

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
 * Google Play policy gate: the prominent in-app disclosure MUST be shown and
 * explicitly accepted BEFORE the user is ever directed to the Android
 * Accessibility Settings screen. Safe to call repeatedly — resolves
 * immediately once consent has already been recorded, and never throws.
 */
export async function ensureAccessibilityServiceConsent(): Promise<boolean> {
  if (Platform.OS !== 'android') return true

  try {
    const store = useA11yServiceDisclosureStore.getState()
    if (store.consentGiven) return true

    const result = await store.requestDisclosure()
    return result === 'accepted'
  } catch (e) {
    if (__DEV__) console.warn('[DriveMind] ensureAccessibilityServiceConsent failed', e)
    return false
  }
}

/**
 * Single point of truth for all "go enable Order Reader" flows: checks
 * whether the service is already enabled, shows the mandatory disclosure
 * (once — the consent flag is then persisted) and only then opens the
 * native Accessibility Settings screen.
 */
export async function openAccessibilitySettingsWithDisclosure(): Promise<AccessibilitySettingsPromptResult> {
  if (Platform.OS !== 'android') return 'already-enabled'

  const needsSettings = await checkAndRequestAccessibility()
  if (!needsSettings) {
    return 'already-enabled'
  }

  const consented = await ensureAccessibilityServiceConsent()
  if (!consented) return 'cancelled'

  openAccessibilitySettings()
  return 'opened'
}

/**
 * User-initiated "grant / manage" buttons (Permissions screen, Integration
 * Health card): always opens Settings after consent, even if the service is
 * already enabled — the user explicitly asked to be taken there.
 */
export async function openAccessibilitySettingsManaged(): Promise<AccessibilitySettingsPromptResult> {
  if (Platform.OS !== 'android') return 'already-enabled'

  const consented = await ensureAccessibilityServiceConsent()
  if (!consented) return 'cancelled'

  openAccessibilitySettings()
  return 'opened'
}

/**
 * Explicit Order Reader toggle — shows the mandatory disclosure (first time
 * only, then remembered) before directing the user to Settings.
 */
export async function openOrderReaderAccessibilityExplicit(): Promise<AccessibilitySettingsPromptResult> {
  return openAccessibilitySettingsWithDisclosure()
}

/**
 * @deprecated Use openOrderReaderAccessibilityExplicit — same gated behavior.
 */
export async function promptAccessibilitySettingsWithDisclosure(): Promise<AccessibilitySettingsPromptResult> {
  return openOrderReaderAccessibilityExplicit()
}

/**
 * Shift start flow: shows the mandatory disclosure (first time only) then
 * opens accessibility settings when the service is disabled.
 */
export async function requestShiftAccessibilityDisclosure(): Promise<boolean> {
  if (Platform.OS !== 'android') return true

  const result = await openAccessibilitySettingsWithDisclosure()
  return result !== 'cancelled'
}
