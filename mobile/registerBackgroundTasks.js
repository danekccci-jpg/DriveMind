try {
  const NUCLEAR_DISABLE_BACKGROUND_PLUGINS = false
  if (!NUCLEAR_DISABLE_BACKGROUND_PLUGINS) {
    /** Register background task before app bootstrap (release-safe for TaskManager). */
    const TaskManager = require('expo-task-manager')
    const { LOCATION_TRACKING_TASK } = require('./src/tasks/locationTrackingTask')

    TaskManager.defineTask(LOCATION_TRACKING_TASK, async (taskBody) => {
      try {
        const maybeHandler = require('./src/tasks/locationTrackingTask').handleLocationTrackingTask
        if (typeof maybeHandler === 'function') {
          await maybeHandler(taskBody)
          return
        }
        console.error('[DriveMind LocationTask]: Handler not loaded; using fallback')

        const { error, data } = taskBody || {}
        if (error) {
          console.error('[DriveMind LocationTask]: task error', error)
          return
        }

        const count = Array.isArray(data?.locations) ? data.locations.length : 0
        console.log('[DriveMind LocationTask]: heartbeat', { task: LOCATION_TRACKING_TASK, locations: count })
      } catch (e) {
        console.error('[DriveMind LocationTask]: defineTask wrapper error', e)
      }
    })
  }
} catch (e) {
  console.error('[DriveMind TaskManager bootstrap]: failed', e)
}
