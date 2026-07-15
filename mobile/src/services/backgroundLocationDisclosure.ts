import { Platform } from 'react-native'

import { useBackgroundLocationDisclosureStore } from '../store/backgroundLocationDisclosureStore'

/**
 * Google Play policy gate: the prominent in-app disclosure MUST be shown and
 * explicitly accepted BEFORE the system background-location permission dialog
 * is ever triggered. Safe to call from any thread context / any number of
 * times — resolves immediately once consent has already been recorded.
 *
 * Never throws: on any unexpected failure this resolves `false` so callers
 * can silently skip the background feature rather than crash.
 */
export async function ensureBackgroundLocationConsent(): Promise<boolean> {
  if (Platform.OS !== 'android') return true

  try {
    const store = useBackgroundLocationDisclosureStore.getState()
    if (store.consentGiven) return true
    if (store.declinedThisSession) return false

    const result = await store.requestDisclosure()
    return result === 'accepted'
  } catch (e) {
    if (__DEV__) console.warn('[DriveMind] ensureBackgroundLocationConsent failed', e)
    return false
  }
}

/** Read-only — true once the user has ever accepted the disclosure. */
export function hasBackgroundLocationConsent(): boolean {
  try {
    return useBackgroundLocationDisclosureStore.getState().consentGiven
  } catch {
    return false
  }
}
