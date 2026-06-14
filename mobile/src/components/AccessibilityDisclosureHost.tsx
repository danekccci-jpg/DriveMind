import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AppState, Platform } from 'react-native'

import { ProminentDisclosureModal } from './ProminentDisclosureModal'
import { useAccessibilityDisclosureStore } from '../store/accessibilityDisclosureStore'
import { usePermissionOnboardingStore } from '../store/permissionOnboardingStore'
import { isNativeIngestBridgeActive } from '../services/permissionManager'
import { suppressAllDisclosureUI } from '../services/disclosureCoordinator'

/**
 * App-wide host for the permissions onboarding modal.
 *
 * Visibility:
 * - Auto: missing notification-listener OR background location (map focus check).
 * - Explicit: shift / accessibility flows call requestDisclosure() (Google Play compliance).
 * - Session dismiss ("Maybe later") suppresses auto only until cold start.
 * - Native bridge active: host returns null — no overlay can mount.
 */
export function AccessibilityDisclosureHost() {
  const explicitVisible = useAccessibilityDisclosureStore((s) => s.visible)
  const acceptDisclosure = useAccessibilityDisclosureStore((s) => s.accept)
  const cancelDisclosure = useAccessibilityDisclosureStore((s) => s.cancel)

  const autoVisible = usePermissionOnboardingStore((s) => s.autoVisible)
  const sessionDismissed = usePermissionOnboardingStore((s) => s.sessionDismissed)
  const dismissForSession = usePermissionOnboardingStore((s) => s.dismissForSession)

  const [bridgeChecked, setBridgeChecked] = useState(Platform.OS !== 'android')
  const [bridgeActive, setBridgeActive] = useState(false)

  const syncBridgeState = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setBridgeActive(true)
      setBridgeChecked(true)
      suppressAllDisclosureUI()
      return
    }
    const active = await isNativeIngestBridgeActive()
    setBridgeActive(active)
    setBridgeChecked(true)
    if (active) suppressAllDisclosureUI()
  }, [])

  useEffect(() => {
    void syncBridgeState()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncBridgeState()
    })
    return () => sub.remove()
  }, [syncBridgeState])

  const visible = useMemo(
    () => !bridgeActive && (explicitVisible || (autoVisible && !sessionDismissed)),
    [bridgeActive, explicitVisible, autoVisible, sessionDismissed],
  )

  const handleAccept = useCallback(() => {
    dismissForSession()
    if (explicitVisible) acceptDisclosure()
  }, [acceptDisclosure, dismissForSession, explicitVisible])

  const handleCancel = useCallback(() => {
    dismissForSession()
    if (explicitVisible) cancelDisclosure()
  }, [cancelDisclosure, dismissForSession, explicitVisible])

  if (!bridgeChecked || bridgeActive) return null

  return (
    <ProminentDisclosureModal
      visible={visible}
      bridgeActive={bridgeActive}
      onAccept={handleAccept}
      onCancel={handleCancel}
    />
  )
}
