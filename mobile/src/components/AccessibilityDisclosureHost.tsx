import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AppState, Platform } from 'react-native'

import { ProminentDisclosureModal } from './ProminentDisclosureModal'
import { useAccessibilityDisclosureStore } from '../store/accessibilityDisclosureStore'
import {
  MAX_PERMISSION_AUTO_PROMPTS,
  usePermissionOnboardingStore,
} from '../store/permissionOnboardingStore'
import { isNativeIngestBridgeActive } from '../services/permissionManager'
import { suppressAllDisclosureUI } from '../services/disclosureCoordinator'

/**
 * App-wide host for the permissions onboarding modal.
 *
 * Visibility:
 * - Auto: cold start only when ingest permissions missing and shown < 3 times total.
 * - Explicit: shift / Order Reader flows call requestDisclosure() (first app open only).
 * - Session dismiss ("Maybe later") suppresses auto until next cold start.
 * - Native bridge active: host returns null — no overlay can mount.
 */
export function AccessibilityDisclosureHost() {
  const explicitVisible = useAccessibilityDisclosureStore((s) => s.visible)
  const acceptDisclosure = useAccessibilityDisclosureStore((s) => s.accept)
  const cancelDisclosure = useAccessibilityDisclosureStore((s) => s.cancel)

  const autoVisible = usePermissionOnboardingStore((s) => s.autoVisible)
  const permissionsShownCount = usePermissionOnboardingStore((s) => s.permissionsShownCount)
  const sessionDismissed = usePermissionOnboardingStore((s) => s.sessionDismissed)
  const lastKnownAllGranted = usePermissionOnboardingStore((s) => s.lastKnownAllGranted)
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

  const canAutoShowOnColdStart =
    permissionsShownCount > 0 && permissionsShownCount <= MAX_PERMISSION_AUTO_PROMPTS

  const visible = useMemo(
    () =>
      !bridgeActive &&
      (explicitVisible || (autoVisible && !sessionDismissed && canAutoShowOnColdStart)),
    [bridgeActive, explicitVisible, autoVisible, sessionDismissed, canAutoShowOnColdStart],
  )

  const handleAccept = useCallback(() => {
    dismissForSession()
    if (explicitVisible) acceptDisclosure()
  }, [acceptDisclosure, dismissForSession, explicitVisible])

  const handleCancel = useCallback(() => {
    dismissForSession()
    if (explicitVisible) cancelDisclosure()
  }, [cancelDisclosure, dismissForSession, explicitVisible])

  if (!bridgeChecked || bridgeActive || lastKnownAllGranted) return null

  return (
    <ProminentDisclosureModal
      visible={visible}
      bridgeActive={bridgeActive}
      onAccept={handleAccept}
      onCancel={handleCancel}
    />
  )
}
