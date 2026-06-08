import React, { useCallback } from 'react'

import { ProminentDisclosureModal } from './ProminentDisclosureModal'
import { useAccessibilityDisclosureStore } from '../store/accessibilityDisclosureStore'

/** App-wide host for the Google Play prominent accessibility disclosure modal. */
export function AccessibilityDisclosureHost() {
  const visible = useAccessibilityDisclosureStore((s) => s.visible)
  const accept = useAccessibilityDisclosureStore((s) => s.accept)
  const cancel = useAccessibilityDisclosureStore((s) => s.cancel)

  const handleAccept = useCallback(() => {
    accept()
  }, [accept])

  const handleCancel = useCallback(() => {
    cancel()
  }, [cancel])

  return (
    <ProminentDisclosureModal
      visible={visible}
      onAccept={handleAccept}
      onCancel={handleCancel}
    />
  )
}
