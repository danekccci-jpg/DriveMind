// Keep task name as a plain literal string for release-safe early evaluation.
export const LOCATION_TRACKING_TASK = 'background-location-task'

// Emergency-safe named export used by index.js.
// Intentionally minimal: no store/API usage during early TaskManager boot.
export async function handleLocationTrackingTask(_taskBody: unknown): Promise<void> {
  return
}
