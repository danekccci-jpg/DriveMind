import { NativeModules, Platform } from 'react-native'
import i18n from '../i18n'
import { isGuestEmail, useAuthStore } from '../store/authStore'
import {
  isSearchBlocked,
  GUEST_ORDER_THRESHOLD,
  type FirestoreUser,
} from './userFirestoreService'

export { GUEST_ORDER_THRESHOLD }

type GateNative = {
  setOrderParsingEnabled?: (enabled: boolean) => void
  setOverlayRadarLabel?: (label: string) => void
  hideOverlay?: () => void
}

function getNative(): GateNative | null {
  if (Platform.OS !== 'android') return null
  return (NativeModules.DriveMindNative as GateNative | undefined) ?? null
}

/**
 * Returns true when the current user (guest or auth) should be blocked from
 * receiving order events.
 *
 * - Guests:     blocked when guestOrderCount >= GUEST_ORDER_THRESHOLD
 * - Auth users: blocked via isSearchBlocked() (order count + time expiry)
 */
export function deriveSearchBlockedFromStore(): boolean {
  const state = useAuthStore.getState()

  if (isGuestEmail(state.userEmail)) {
    return state.guestOrderCount >= GUEST_ORDER_THRESHOLD
  }

  return isSearchBlocked({
    completedOrdersCount: state.completedOrdersCount,
    isSubscribed: state.isSubscribed,
    trialEndsAt: state.trialEndsAt,
    subscriptionEndsAt: state.subscriptionEndsAt,
  })
}

/**
 * Syncs the native scraper gate and overlay label based on current auth + shift state.
 *
 * Pass a `user` snapshot when calling right after a Firestore read to avoid a
 * race with the async authStore update (e.g. inside `syncUserSession`).
 */
export function syncOrderParsingGate(
  user?: Pick<
    FirestoreUser,
    'completedOrdersCount' | 'isSubscribed' | 'trialEndsAt' | 'subscriptionEndsAt'
  >,
): void {
  const state = useAuthStore.getState()

  let blocked: boolean
  if (user) {
    // Caller already knows the user state — use it directly
    blocked = isSearchBlocked(user)
  } else if (isGuestEmail(state.userEmail)) {
    blocked = state.guestOrderCount >= GUEST_ORDER_THRESHOLD
  } else {
    blocked = isSearchBlocked({
      completedOrdersCount: state.completedOrdersCount,
      isSubscribed: state.isSubscribed,
      trialEndsAt: state.trialEndsAt,
      subscriptionEndsAt: state.subscriptionEndsAt,
    })
  }

  if (useAuthStore.getState().isSearchBlocked !== blocked) {
    useAuthStore.getState().setSearchBlocked(blocked)
  }

  const native = getNative()
  if (!native) return

  const parsingEnabled = !blocked

  try {
    native.setOrderParsingEnabled?.(parsingEnabled)
    native.setOverlayRadarLabel?.(
      blocked ? i18n.t('searchStatusBlocked') : i18n.t('searchStatusActive'),
    )
    if (blocked) native.hideOverlay?.()
  } catch {
    /* noop */
  }
}

export const EVENT_OPEN_PAYWALL = 'DriveMindOpenPaywall'
