import * as BackgroundTask from 'expo-background-task'
import * as TaskManager from 'expo-task-manager'
import { AppState, Platform } from 'react-native'

import { checkCronRuns } from '@/lib/cronWatch'
import { HermesConnection, useRuntime } from '@/lib/hermes'
import { activeConnection, useConnections } from '@/store/connections'
import { useSettings } from '@/store/settings'

// Keep this module's import graph headless: no src/store/chat, no components that need React tree.

const CRON_TASK = 'hermes-cron-check'

/**
 * Periodic check for cron runs that finished while the app was dead. It only ever talks REST —
 * opening a gateway socket from WorkManager is not allowed (and pointless: the foreground watcher
 * covers every moment the app is alive).
 */
if (Platform.OS !== 'web') {
  TaskManager.defineTask(CRON_TASK, async () => {
    try {
      if (!useConnections.persist.hasHydrated()) await useConnections.persist.rehydrate()
      if (!useSettings.persist.hasHydrated()) await useSettings.persist.rehydrate()
      // The foreground watcher is already on duty whenever the app is alive.
      if (AppState.currentState === 'active') return BackgroundTask.BackgroundTaskResult.Success
      if (!useSettings.getState().notifyCron) return BackgroundTask.BackgroundTaskResult.Success
      const conn = activeConnection()
      if (!conn) return BackgroundTask.BackgroundTaskResult.Success
      let h = useRuntime.getState().hermes
      if (h?.conn.id !== conn.id) {
        h = new HermesConnection(conn)
        await h.load()
      }
      await checkCronRuns(h, { foreground: false })
      return BackgroundTask.BackgroundTaskResult.Success
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed
    }
  })
}

/** Register or unregister the periodic check; safe to call on every relevant state change. */
export async function syncCronBackgroundCheck(enabled: boolean) {
  if (Platform.OS !== 'web') {
    try {
      const registered = await TaskManager.isTaskRegisteredAsync(CRON_TASK)
      if (enabled && !registered) await BackgroundTask.registerTaskAsync(CRON_TASK, { minimumInterval: 15 })
      else if (!enabled && registered) await BackgroundTask.unregisterTaskAsync(CRON_TASK)
    } catch {
      // WorkManager can refuse (e.g. inside Expo Go); notifications just stay foreground-only.
    }
  }
}
