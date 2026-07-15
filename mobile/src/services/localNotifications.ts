import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import i18n from '../i18n'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false
  const { status: existing } = await Notifications.getPermissionsAsync()
  if (existing === 'granted') return true
  const { status } = await Notifications.requestPermissionsAsync()
  return status === 'granted'
}

/**
 * Fires a local push notification when the 15 welcome trips are exhausted.
 * Invites the driver back into the full app to check subscription.
 */
export async function sendTrialExhaustedNotification(): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: i18n.t('push_trial_ended_title'),
        body: i18n.t('push_trial_ended_body'),
        data: { screen: 'Paywall' },
      },
      trigger: null,
    })
  } catch {
    /* Permission denied or scheduling failed — non-critical */
  }
}

/**
 * Fires when trial 7-day window expires (called from a periodic check or
 * when the app foregrounds and detects expiry).
 */
export async function sendTrialExpiredNotification(): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: i18n.t('push_trial_expired_title'),
        body: i18n.t('push_trial_expired_body'),
        data: { screen: 'Paywall' },
      },
      trigger: null,
    })
  } catch {
    /* noop */
  }
}
