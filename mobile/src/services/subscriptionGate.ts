import { NativeModules, Platform } from 'react-native'
import i18n from '../i18n'
import { isGuestEmail, useAuthStore } from '../store/authStore'
import { useOrdersStore } from '../store/ordersStore'
import { isSearchBlocked, type FirestoreUser } from './userFirestoreService'

type GateNative = {
  setOrderParsingEnabled?: (enabled: boolean) => void
  setOverlayRadarLabel?: (label: string) => void
  hideOverlay?: () => void
}

function getNative(): GateNative | null {
  if (Platform.OS !== 'android') return null
  return (NativeModules.DriveMindNative as GateNative | undefined) ?? null
}

export function deriveSearchBlockedFromStore(): boolean {
  const { isSubscribed, completedOrdersCount, userEmail } = useAuthStore.getState()
  if (isGuestEmail(userEmail)) return false
  return isSearchBlocked({
    completedOrdersCount,
    isSubscribed,
    trialEndsAt: useAuthStore.getState().trialEndsAt,
  })
}

export function syncOrderParsingGate(user?: Pick<FirestoreUser, 'completedOrdersCount' | 'isSubscribed' | 'trialEndsAt'>): void {
  const state = useAuthStore.getState()
  const blocked = user
    ? isSearchBlocked(user)
    : isSearchBlocked({
        completedOrdersCount: state.completedOrdersCount,
        isSubscribed: state.isSubscribed,
        trialEndsAt: state.trialEndsAt,
      })

  useAuthStore.getState().setSearchBlocked(blocked)

  const native = getNative()
  if (!native) return

  const isShiftOn = useOrdersStore.getState().shiftStats.startTime !== null
  const parsingEnabled = isShiftOn && !blocked

  try {
    native.setOrderParsingEnabled?.(parsingEnabled)
    native.setOverlayRadarLabel?.(blocked ? i18n.t('searchStatusBlocked') : i18n.t('searchStatusActive'))
    if (blocked || !isShiftOn) native.hideOverlay?.()
  } catch {
    /* noop */
  }
}

export const EVENT_OPEN_PAYWALL = 'DriveMindOpenPaywall'
