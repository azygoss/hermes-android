import * as Haptics from 'expo-haptics'
import { Platform } from 'react-native'

import { useSettings } from '@/store/settings'

type Kind = 'select' | 'light' | 'medium' | 'success' | 'warn'

/** One place for touch feedback, so the Settings switch silences all of it. */
export function haptic(kind: Kind = 'select') {
  if (Platform.OS === 'web' || !useSettings.getState().haptics) return
  const run =
    kind === 'select'
      ? Haptics.selectionAsync()
      : kind === 'success' || kind === 'warn'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType[kind === 'success' ? 'Success' : 'Warning'])
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle[kind === 'light' ? 'Light' : 'Medium'])
  run.catch(() => {})
}
