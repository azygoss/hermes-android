import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import { useEffect } from 'react'
import { AppState, Platform } from 'react-native'

import { t } from '@/i18n'
import { textOf } from '@/lib/chat/types'
import { speak } from '@/lib/voice'
import { answerRequest, onTurnComplete, openStored, setActive, useChat } from '@/store/chat'
import { useSettings } from '@/store/settings'

const APPROVAL_CATEGORY = 'hermes-approval'

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  })
}

/** Request id → the notification that announced it, so answering in the app clears it. */
const requestNotifications = new Map<string, string>()

/** Open the chat a notification belongs to: the live runtime if it is still open, else the stored session. */
function openChat(data: { sessionId?: string; storedId?: string | null }) {
  const { sessions } = useChat.getState()
  if (data.sessionId && sessions[data.sessionId]) {
    setActive(data.sessionId)
    router.navigate('/chat')
  } else if (data.storedId) {
    router.navigate('/chat')
    void openStored(data.storedId).catch(() => {})
  } else router.navigate('/chat')
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
              data: { storedId: session.storedId, sessionId: session.runtimeId },
            },
            trigger: null,
          }).catch(() => {})
        }
      }),
    [],
  )

  // Approve or deny straight from the notification. Both buttons bring the app forward: the answer
  // travels over the gateway socket, which only a running app has.
  useEffect(() => {
    if (Platform.OS === 'web') return
    void Notifications.setNotificationCategoryAsync(APPROVAL_CATEGORY, [
      { identifier: 'once', buttonTitle: t('Allow once'), options: { opensAppToForeground: true } },
      { identifier: 'deny', buttonTitle: t('Deny'), options: { opensAppToForeground: true, isDestructive: true } },
    ]).catch(() => {})
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { sessionId?: string; storedId?: string; requestId?: string }
      const action = response.actionIdentifier
      if ((action === 'once' || action === 'deny') && data.requestId) {
        if (useChat.getState().requests.some((r) => r.id === data.requestId)) answerRequest(data.requestId, { choice: action })
      }
      openChat(data)
      void Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => {})
    })
    return () => sub.remove()
  }, [])

  // Agent questions (approvals, clarify, passwords) need the user even while the app is closed.
  useEffect(
    () =>
      useChat.subscribe((state, prev) => {
        if (Platform.OS === 'web') return
        // Answered in the app (or elsewhere): take its notification down.
        for (const [id, notificationId] of requestNotifications) {
          if (!state.requests.some((r) => r.id === id)) {
            requestNotifications.delete(id)
            void Notifications.dismissNotificationAsync(notificationId).catch(() => {})
          }
        }
        if (state.requests.length <= prev.requests.length) return
        if (AppState.currentState === 'active') return
        const req = state.requests[state.requests.length - 1]
        const params = req.params as { command?: string; prompt?: string; choices?: string[] }
        const approval = req.method === 'approval' && (!params.choices?.length || params.choices.includes('once'))
        void Notifications.scheduleNotificationAsync({
          content: {
            title: req.method === 'approval' ? t('Approval needed') : t('Hermes needs your input'),
            body: String(params.command ?? params.prompt ?? ''),
            data: { sessionId: req.sessionId, requestId: req.id },
            ...(approval ? { categoryIdentifier: APPROVAL_CATEGORY } : {}),
          },
          trigger: null,
        })
          .then((id) => requestNotifications.set(req.id, id))
          .catch(() => {})
      }),
    [],
  )
  return null
}
