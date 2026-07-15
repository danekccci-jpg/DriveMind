import React, { useCallback } from 'react'

import { BackgroundLocationDisclosureModal } from './BackgroundLocationDisclosureModal'
import { useBackgroundLocationDisclosureStore } from '../store/backgroundLocationDisclosureStore'

/**
 * App-wide host for the Google Play BACKGROUND_LOCATION prominent disclosure.
 * Mounted once near the app root — visibility is entirely store-driven so it
 * can be triggered from anywhere (nav start, shift start, background sync)
 * without prop drilling.
 */
export function BackgroundLocationDisclosureHost() {
  const visible = useBackgroundLocationDisclosureStore((s) => s.visible)
  const accept = useBackgroundLocationDisclosureStore((s) => s.accept)
  const decline = useBackgroundLocationDisclosureStore((s) => s.decline)

  const handleAccept = useCallback(() => accept(), [accept])
  const handleDecline = useCallback(() => decline(), [decline])

  return (
    <BackgroundLocationDisclosureModal
      visible={visible}
      onAccept={handleAccept}
      onDecline={handleDecline}
    />
  )
}
