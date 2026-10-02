import { router, Stack, useLocalSearchParams } from 'expo-router'
import { ArrowUp, Octagon, Trash2 } from '@/components/icons'
import { useMemo, useState } from 'react'
import { FlatList, Platform, StyleSheet, TextInput, View } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Markdown } from '@/components/chat/Markdown'
import { Badge, confirm, IconButton, Loading, Text, toastError } from '@/components/ui'
import { useT } from '@/i18n'
import { relativeTime } from '@/lib/format'
import type { RoomEvent } from '@/lib/gateway/contract.generated'
import { useRpc } from '@/lib/hooks'
import { rpc, useProfile } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { font, radius, space, useTheme } from '@/theme'

function eventText(e: RoomEvent) {
  const p = e.payload as Record<string, unknown>
  if (typeof p.text === 'string') return p.text
  if (typeof p.content === 'string') return p.content
  if (typeof p.message === 'string') return p.message
  return ''
}

export default function RoomScreen() {
  const t = useT()
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const profile = useProfile()
  const state = useRpc(['groups', 'state', id], 'groups.state', { room_id: id, profile }, { refetchInterval: 5000 })
  const log = useRpc(['groups', 'log', id], 'groups.log', { room_id: id, since_seq: 0, limit: 500, profile }, { refetchInterval: 2500 })
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const events = useMemo(
    () => [...(log.data?.events ?? [])].filter((e) => e.kind.startsWith('message.') || eventText(e)).reverse(),
    [log.data],
  )

  async function send() {
    if (!text.trim()) return
    setSending(true)
    try {
      await rpc().request('groups.send', {
        room_id: id,
        event_id: `android-${Date.now()}`,
        payload: { text: text.trim(), thread_id: 'main' },
        profile,
      })
      setText('')
      await queryClient.invalidateQueries({ queryKey: ['groups', 'log', id] })
    } catch (e) {
      toastError(e)
    } finally {
      setSending(false)
    }
  }

  const room = state.data?.room
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: room?.name ?? t('Room'),
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <IconButton
                icon={Octagon}
                label={t('Stop the room')}
                onPress={() => rpc().request('groups.stop', { room_id: id, profile }).catch(toastError)}
              />
              <IconButton
                icon={Trash2}
                label={t('Disband')}
                onPress={async () => {
                  if (
                    !(await confirm(t('Disband this room?'), t('Work stops and the room cannot be reused.'), {
                      destructive: true,
                      confirmLabel: t('Disband'),
                    }))
                  )
                    return
                  try {
                    await rpc().request('groups.disband', { room_id: id, profile })
                    await queryClient.invalidateQueries({ queryKey: ['groups'] })
                    router.back()
                  } catch (e) {
                    toastError(e)
                  }
                }}
              />
            </View>
          ),
        }}
      />
      {room ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, padding: space.md }}>
          {room.members.map((m, i) => (
            <Badge key={i} label={String(m.display_name || m.handle || m.profile)} tone="info" />
          ))}
          {state.data?.driver_status ? <Badge label={String((state.data.driver_status as { state?: string }).state ?? 'idle')} /> : null}
        </View>
      ) : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {log.isLoading ? <Loading /> : null}
        <FlatList
          data={events}
          inverted
          keyExtractor={(e) => `${e.seq}`}
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
          renderItem={({ item }) => {
            const mine = item.actor.kind === 'user'
            return (
              <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 2 }}>
                <Text variant="caption" tone="faint">
                  {mine ? t('You') : item.actor.id} · {relativeTime(item.created_at)}
                </Text>
                <View style={[styles.bubble, { backgroundColor: mine ? c.userBubble : c.surface, borderColor: c.border }]}>
                  <Markdown text={eventText(item) || item.kind} />
                </View>
              </View>
            )
          }}
        />
        <View style={[styles.composer, { borderTopColor: c.border, paddingBottom: insets.bottom + space.sm }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('Message the room')}
            placeholderTextColor={c.textFaint}
            multiline
            style={[styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.border, fontFamily: font.regular }]}
          />
          <IconButton icon={ArrowUp} label={t('Send')} filled onPress={send} disabled={sending || !text.trim()} />
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  bubble: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    maxWidth: '88%',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 16,
  },
})
