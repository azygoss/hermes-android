import * as Notifications from 'expo-notifications'
import { useEffect } from 'react'
import { AppState, Platform } from 'react-native'

import { t } from '@/i18n'
import { textOf } from '@/lib/chat/types'
import { speak } from '@/lib/voice'
import { onTurnComplete, useChat } from '@/store/chat'
import { useSettings } from '@/store/settings'

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  })
}

/** Side effects of a finished turn: read it aloud, or notify when the app is in the background. */
export function TurnEffects() {
  useEffect(
    () =>
      onTurnComplete((session, message) => {
        const { autoSpeak, notifyOnComplete } = useSettings.getState()
        const text = message ? textOf(message) : ''
        const foreground = AppState.currentState === 'active'
        if (autoSpeak && foreground && text && useChat.getState().activeId === session.runtimeId) void speak(text)
        if (notifyOnComplete && !foreground && Platform.OS !== 'web') {
          void Notifications.scheduleNotificationAsync({
            content: {
              title: session.title || t('Hermes finished'),
              body: message?.error ? message.error : text.slice(0, 180) || t('The agent finished its turn.'),
              data: { storedId: session.storedId },
            },
            trigger: null,
          }).catch(() => {})
        }
      }),
    [],
  )

  // Agent questions (approvals, clarify, passwords) need the user even while the app is closed.
  useEffect(
    () =>
      useChat.subscribe((state, prev) => {
        if (state.requests.length <= prev.requests.length) return
        if (AppState.currentState === 'active' || Platform.OS === 'web') return
        const req = state.requests[state.requests.length - 1]
        void Notifications.scheduleNotificationAsync({
          content: {
            title: req.method === 'approval' ? t('Approval needed') : t('Hermes needs your input'),
            body: String((req.params as { command?: string; prompt?: string }).command ?? (req.params as { prompt?: string }).prompt ?? ''),
            data: { sessionId: req.sessionId },
          },
          trigger: null,
        }).catch(() => {})
      }),
    [],
  )
  return null
}
