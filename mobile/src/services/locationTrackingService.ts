import { Platform } from 'react-native'
import * as Location from 'expo-location'
import { LOCATION_TRACKING_TASK } from '../tasks/locationTrackingTask'

export { LOCATION_TRACKING_TASK }

/**
 * Starts high-priority location updates (foreground service on Android).
 * Safe to call repeatedly — no-op if already running.
 */
export async function startLocationTracking(): Promise<boolean> {
  if (Platform.OS === 'web') return true

  const fg = await Location.requestForegroundPermissionsAsync()
  if (fg.status !== 'granted') {
    console.warn('[DriveMind Location]: foreground permission denied')
    return false
  }

  if (Platform.OS === 'android') {
    const bg = await Location.requestBackgroundPermissionsAsync()
    if (bg.status !== 'granted') {
      console.warn('[DriveMind Location]: background permission not granted — OS may stop updates when backgrounded')
    }
  }

  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK)
  if (started) return true

  await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
    accuracy: Location.Accuracy.Balanced,
    /** Aligns with socket emit distance filter (~5 m). */
    distanceInterval: 5,
    timeInterval: 5000,
    deferredUpdatesInterval: 10_000,
    foregroundService: {
      notificationTitle: 'DriveMind: Navigation Active',
      notificationBody: 'Location is used for live navigation and dispatch.',
      notificationColor: '#1A5CFF',
    },
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
  })
  console.log('[DriveMind Location]: background updates started')
  return true
}

export async function stopLocationTracking(): Promise<void> {
  if (Platform.OS === 'web') return
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK)
  if (started) {
    await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK)
    console.log('[DriveMind Location]: background updates stopped')
  }
}
