import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

import { t } from '@/i18n'

export const CHANNELS = { turns: 'hermes-turns', requests: 'hermes-requests', cron: 'hermes-cron' } as const
export type NotifyChannel = (typeof CHANNELS)[keyof typeof CHANNELS]

let channelsReady: Promise<void> | null = null

/** Android channels are created once; importance/visibility cannot be changed afterwards anyway. */
export function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve()
  channelsReady ??= (async () => {
    await Notifications.setNotificationChannelAsync(CHANNELS.turns, {
      name: t('Replies'),
      importance: Notifications.AndroidImportance.DEFAULT,
    })
    await Notifications.setNotificationChannelAsync(CHANNELS.requests, {
      name: t('Approvals and questions'),
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    })
    await Notifications.setNotificationChannelAsync(CHANNELS.cron, {
      name: t('Scheduled jobs'),
      importance: Notifications.AndroidImportance.DEFAULT,
    })
  })().catch(() => {})
  return channelsReady
}

/** Post a local notification right now; resolves to its identifier, or null when it could not be shown. */
export async function notify(
  channel: NotifyChannel,
  content: Notifications.NotificationContentInput,
  identifier?: string,
): Promise<string | null> {
  if (Platform.OS === 'web') return null
  try {
    await ensureChannels()
    return await Notifications.scheduleNotificationAsync({
      ...(identifier ? { identifier } : {}),
      content,
      trigger: Platform.OS === 'android' ? { channelId: channel } : null,
    })
  } catch {
    return null
  }
}

/** Current notification permission; asks the user when allowed to and `ask` is set. */
export async function notificationPermission(ask: boolean): Promise<Notifications.PermissionStatus> {
  if (Platform.OS === 'web') return 'granted' as Notifications.PermissionStatus
  const current = await Notifications.getPermissionsAsync()
  if (!ask || current.granted || current.status !== 'undetermined' || !current.canAskAgain) return current.status
  return (await Notifications.requestPermissionsAsync()).status
}
