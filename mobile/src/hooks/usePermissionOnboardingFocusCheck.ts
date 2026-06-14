import { useCallback, useEffect } from 'react'
import { AppState, Platform } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'

import { checkCoreIngestPermissions, isNativeIngestBridgeActive } from '../services/permissionManager'
import { suppressAllDisclosureUI } from '../services/disclosureCoordinator'
import { usePermissionOnboardingStore } from '../store/permissionOnboardingStore'

/**
 * Re-evaluates core ingest permissions every time the map screen gains focus
 * and when the app returns to the foreground. No AsyncStorage — cold start resets session dismiss.
 *
 * When the native bridge reports ingest-ready, all disclosure overlays are suppressed
 * immediately so a stale JS permission read cannot reopen the modal on cold start.
 */
export function usePermissionOnboardingFocusCheck(): void {
  const setAutoVisible = usePermissionOnboardingStore((s) => s.setAutoVisible)

  const evaluate = useCallback(async () => {
    if (Platform.OS !== 'android') {
      suppressAllDisclosureUI()
      return
    }

    const bridgeActive = await isNativeIngestBridgeActive()
    if (bridgeActive) {
      suppressAllDisclosureUI()
      return
    }

    const snapshot = await checkCoreIngestPermissions()
    setAutoVisible(!snapshot.allGranted)
  }, [setAutoVisible])

  useFocusEffect(
    useCallback(() => {
      void evaluate()
    }, [evaluate]),
  )

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void evaluate()
    })
    return () => sub.remove()
  }, [evaluate])
}
