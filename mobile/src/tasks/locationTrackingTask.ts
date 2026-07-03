import { useShiftBreadcrumbStore } from '../store/shiftBreadcrumbStore'

export const LOCATION_TRACKING_TASK = 'background-location-task'

interface LocationTaskBody {
  data?: {
    locations?: Array<{
      coords: { latitude: number; longitude: number; accuracy?: number }
      timestamp?: number
    }>
  }
}

/**
 * Background location handler registered via expo-task-manager.
 * Feeds GPS points into the shift breadcrumb store for route reconstruction.
 */
export async function handleLocationTrackingTask(taskBody: unknown): Promise<void> {
  const body = taskBody as LocationTaskBody
  const locations = body?.data?.locations
  if (!locations?.length) return

  const store = useShiftBreadcrumbStore.getState()
  if (!store.isRecording) return

  for (const loc of locations) {
    const { latitude, longitude, accuracy } = loc.coords
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue
    if (typeof accuracy === 'number' && accuracy > 50) continue
    store.addBreadcrumb(latitude, longitude)
  }
}
