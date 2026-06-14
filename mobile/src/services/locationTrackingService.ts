import { Platform } from 'react-native'
import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import { LOCATION_TRACKING_TASK } from '../tasks/locationTrackingTask'
import { devLog, devWarn, devError } from '../utils/logger'

export { LOCATION_TRACKING_TASK }

/**
 * Starts high-priority location updates (foreground service on Android).
 * Safe to call repeatedly — no-op if already running.
 */
let foregroundDeniedThisSession = false
let backgroundPromptedThisSession = false

export async function startLocationTracking(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return true

    const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TRACKING_TASK)
    if (!isRegistered) {
      devWarn('[DriveMind Location]: task is not registered, skip start', LOCATION_TRACKING_TASK)
      return false
    }

    const fgExisting = await Location.getForegroundPermissionsAsync()
    let fgGranted = fgExisting.status === 'granted'
    if (!fgGranted) {
      if (foregroundDeniedThisSession) {
        devWarn('[DriveMind Location]: foreground permission denied earlier this session')
        return false
      }
      const fg = await Location.requestForegroundPermissionsAsync()
      fgGranted = fg.status === 'granted'
      if (!fgGranted) {
        foregroundDeniedThisSession = true
        devWarn('[DriveMind Location]: foreground permission denied')
        return false
      }
    }

    if (Platform.OS === 'android') {
      const bgExisting = await Location.getBackgroundPermissionsAsync()
      if (bgExisting.status !== 'granted' && !backgroundPromptedThisSession) {
        backgroundPromptedThisSession = true
        const bg = await Location.requestBackgroundPermissionsAsync()
        if (bg.status !== 'granted') {
          devWarn('[DriveMind Location]: background permission not granted — OS may stop updates when backgrounded')
        }
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
    devLog('[DriveMind Location]: background updates started')
    return true
  } catch (e) {
    devError('[DriveMind Location]: failed to start background updates', e)
    return false
  }
}

export async function stopLocationTracking(): Promise<void> {
  if (Platform.OS === 'web') return
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK)
  if (started) {
    await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK)
    devLog('[DriveMind Location]: background updates stopped')
  }
}
