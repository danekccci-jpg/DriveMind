import * as TaskManager from 'expo-task-manager'
import * as Location from 'expo-location'
import { navigationEngine } from '../services/navigationEngine'
import { useDriverSessionStore } from '../store/driverSessionStore'

export const LOCATION_TRACKING_TASK = 'LOCATION_TRACKING_TASK'

TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[DriveMind LocationTask]:', error)
    return
  }
  if (!data || typeof data !== 'object' || !('locations' in data)) return
  const locations = (data as { locations: Location.LocationObject[] }).locations
  const loc = locations[locations.length - 1]
  if (!loc) return

  const isOnline = useDriverSessionStore.getState().isOnline
  const h = loc.coords.heading
  navigationEngine.reportDriverLocation({
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    heading: h != null && h >= 0 ? h : null,
    speed: loc.coords.speed,
    isOnline,
  })
})
