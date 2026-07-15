import React, { useCallback } from 'react'

import { AccessibilityServiceDisclosureModal } from './AccessibilityServiceDisclosureModal'
import { useA11yServiceDisclosureStore } from '../store/a11yServiceDisclosureStore'

/**
 * App-wide host for the Google Play AccessibilityService prominent disclosure.
 * Mounted once near the app root — visibility is entirely store-driven so it
 * can be triggered from any permissions screen, shift-start flow, or
 * integration card without prop drilling.
 */
export function AccessibilityServiceDisclosureHost() {
  const visible = useA11yServiceDisclosureStore((s) => s.visible)
  const continueToSettings = useA11yServiceDisclosureStore((s) => s.continueToSettings)
  const cancel = useA11yServiceDisclosureStore((s) => s.cancel)

  const handleContinue = useCallback(() => continueToSettings(), [continueToSettings])
  const handleCancel = useCallback(() => cancel(), [cancel])

  return (
    <AccessibilityServiceDisclosureModal
      visible={visible}
      onContinue={handleContinue}
      onCancel={handleCancel}
    />
  )
}
