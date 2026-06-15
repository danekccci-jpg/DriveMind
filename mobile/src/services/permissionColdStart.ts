import { Platform } from 'react-native'

import {
  MAX_PERMISSION_AUTO_PROMPTS,
  usePermissionOnboardingStore,
} from '../store/permissionOnboardingStore'
import { checkCoreIngestPermissions, isNativeIngestBridgeActive } from './permissionManager'
import { suppressAllDisclosureUI } from './disclosureCoordinator'

/** One-shot guard — resets only when the OS kills the process (true cold start). */
let coldStartHandledThisProcess = false

/**
 * Runs once per process launch after persisted onboarding state rehydrates.
 * Increments cold-start counters and may arm the auto permission modal.
 */
export async function runPermissionColdStartOnce(): Promise<void> {
  if (coldStartHandledThisProcess) return
  coldStartHandledThisProcess = true

  if (Platform.OS !== 'android') {
    suppressAllDisclosureUI()
    return
  }

  const store = usePermissionOnboardingStore.getState()
  store.incrementAppOpenCount()

  const bridgeActive = await isNativeIngestBridgeActive()
  if (bridgeActive) {
    suppressAllDisclosureUI()
    return
  }

  const snapshot = await checkCoreIngestPermissions()
  if (snapshot.allGranted) {
    store.setAutoVisible(false)
    return
  }

  if (store.permissionsShownCount >= MAX_PERMISSION_AUTO_PROMPTS) {
    store.setAutoVisible(false)
    return
  }

  store.recordPermissionPromptShown()
}

/** Wait for persisted counters before evaluating cold-start rules. */
export function runPermissionColdStartAfterHydration(): void {
  const { persist } = usePermissionOnboardingStore

  const start = () => {
    void runPermissionColdStartOnce()
  }

  if (persist.hasHydrated()) {
    start()
    return
  }

  const unsub = persist.onFinishHydration(() => {
    unsub()
    start()
  })
}
