import { useCallback, useEffect } from 'react'
import { AppState, Platform } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'

import { checkCoreIngestPermissions, isNativeIngestBridgeActive } from '../services/permissionManager'
import { suppressAllDisclosureUI } from '../services/disclosureCoordinator'
import { usePermissionOnboardingStore } from '../store/permissionOnboardingStore'

/**
 * Re-evaluates core ingest permissions when the map screen gains focus or the app
 * returns from background. Does NOT auto-open the permission modal — that is
 * cold-start only (see permissionColdStart.ts).
 *
 * When ingest becomes ready, disclosure overlays are suppressed immediately.
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
    if (snapshot.allGranted) {
      setAutoVisible(false)
    }
    // Never set autoVisible true here — cold start owns the entry prompt.
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
