import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { memo, useMemo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { SessionRow } from '@/app/(tabs)/sessions'
import { HermesMark } from '@/components/HermesMark'
import { Check, ChevronDown, ChevronUp, History, PenSquare, Pin, Search, Server, Settings2 } from '@/components/icons'
import { switchProfile, useProfiles } from '@/components/ProfileSwitcher'
import { Chip, Text, toastError } from '@/components/ui'
import { useT } from '@/i18n'
import { relativeTime } from '@/lib/format'
import { rest, useRuntime } from '@/lib/hermes'
import { openStored, setActive, useChat } from '@/store/chat'
import { useConnections } from '@/store/connections'
import { font, radius, space, useTheme } from '@/theme'

/**
 * Left drawer of the chat tab: switch backend and profile, start a chat, and jump between recent
 * chats without leaving the conversation.
 */
export function ChatDrawer({ onClose }: { onClose: () => void }) {
  const t = useT()
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const connected = useRuntime((s) => s.state === 'open')
  const connections = useConnections((s) => s.connections)
  const activeConn = useConnections((s) => s.connections.find((x) => x.id === s.activeId))
  const profiles = useProfiles()
  const currentProfile = activeConn?.profile ?? null
  const [backendsOpen, setBackendsOpen] = useState(false)
  const [q, setQ] = useState('')
  const activeStored = useChat((s) => (s.activeId ? s.sessions[s.activeId]?.storedId : null))

  const recent = useQuery({
    queryKey: ['sessions', 'drawer'],
    enabled: connected,
    staleTime: 15_000,
    queryFn: () =>
      rest().get<{ sessions: SessionRow[] }>('/api/sessions', {
        query: { limit: 60, offset: 0, order: 'recent', archived: 'exclude', min_messages: 1 },
      }),
  })
  const rows = useMemo(() => {
    const all = recent.data?.sessions ?? []
    const needle = q.trim().toLowerCase()
    const list = needle ? all.filter((r) => `${r.title ?? ''} ${r.preview ?? ''}`.toLowerCase().includes(needle)) : all
    return [...list.filter((r) => r.pinned), ...list.filter((r) => !r.pinned)]
  }, [recent.data, q])

  const open = (row: SessionRow) => {
    onClose()
    openStored(row.id).catch(toastError)
  }

  return (
    <View style={[styles.wrap, { backgroundColor: c.surface, paddingTop: insets.top + space.sm }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: backendsOpen }}
        accessibilityLabel={t('Backend: {name}', { name: activeConn?.name ?? t('Not connected') })}
        onPress={() => setBackendsOpen((o) => !o)}
        style={({ pressed }) => [styles.backend, pressed && { backgroundColor: c.surfaceAlt }]}
      >
        <HermesMark size={26} />
        <View style={{ flex: 1 }}>
          <Text weight="semibold" numberOfLines={1}>
            {activeConn?.name ?? t('Not connected')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[styles.dot, { backgroundColor: connected ? c.success : c.warn }]} />
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {connected ? t('online') : t('offline')}
            </Text>
          </View>
        </View>
        {backendsOpen ? <ChevronUp size={18} color={c.textFaint} /> : <ChevronDown size={18} color={c.textFaint} />}
      </Pressable>

      {backendsOpen ? (
        <View style={{ paddingBottom: space.sm }}>
          {connections.map((conn) => (
            <Pressable
              key={conn.id}
              accessibilityRole="button"
              accessibilityState={{ selected: conn.id === activeConn?.id }}
              onPress={() => {
                setBackendsOpen(false)
                if (conn.id !== activeConn?.id) useConnections.getState().setActive(conn.id)
              }}
              style={({ pressed }) => [styles.option, pressed && { backgroundColor: c.surfaceAlt }]}
            >
              <Server size={16} color={c.textMuted} strokeWidth={1.75} />
              <Text style={{ flex: 1 }} numberOfLines={1}>
                {conn.name}
              </Text>
              {conn.id === activeConn?.id ? <Check size={16} color={c.accentText} /> : null}
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onClose()
              router.push('/connect')
            }}
            style={({ pressed }) => [styles.option, pressed && { backgroundColor: c.surfaceAlt }]}
          >
            <Settings2 size={16} color={c.textMuted} strokeWidth={1.75} />
            <Text tone="muted">{t('Manage backends')}</Text>
          </Pressable>
        </View>
      ) : null}

      {profiles.data?.length ? (
        <View style={{ gap: space.xs, paddingBottom: space.sm }}>
          <Text variant="caption" tone="faint" style={{ paddingHorizontal: space.lg }}>
            {t('Profile')}
          </Text>
          <FlatList
            horizontal
            data={profiles.data}
            keyExtractor={(p) => p.name}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space.xs, paddingHorizontal: space.lg }}
            renderItem={({ item }) => {
              const on = currentProfile ? item.name === currentProfile : !!item.is_default
              return (
                <Chip
                  label={item.display_name || item.name}
                  selected={on}
                  onPress={() => {
                    if (on) return
                    onClose()
                    switchProfile(item.is_default ? null : item.name)
                  }}
                />
              )
            }}
            ListFooterComponent={
              <Chip
                label={t('Manage…')}
                onPress={() => {
                  onClose()
                  router.push('/profiles')
                }}
              />
            }
          />
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          onClose()
          setActive(null)
        }}
        style={({ pressed }) => [styles.newChat, { borderColor: c.border, backgroundColor: pressed ? c.surfaceAlt : c.elevated }]}
      >
        <PenSquare size={18} color={c.text} strokeWidth={1.75} />
        <Text weight="medium">{t('New chat')}</Text>
      </Pressable>

      <View style={[styles.search, { backgroundColor: c.bg, borderColor: c.border }]}>
        <Search size={16} color={c.textFaint} strokeWidth={1.75} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t('Filter chats')}
          placeholderTextColor={c.textFaint}
          accessibilityLabel={t('Filter chats')}
          style={{ flex: 1, minWidth: 0, color: c.text, fontFamily: font.regular, fontSize: 15, height: 40 }}
        />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: space.lg }}
        renderItem={({ item }) => <DrawerRow row={item} current={item.id === activeStored} onOpen={open} />}
        ListEmptyComponent={
          recent.isLoading ? null : (
            <Text tone="muted" variant="small" style={{ padding: space.lg }}>
              {q ? t('No matches') : t('No conversations yet')}
            </Text>
          )
        }
      />

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          onClose()
          router.navigate('/sessions')
        }}
        style={({ pressed }) => [
          styles.footer,
          { borderTopColor: c.border, paddingBottom: insets.bottom + space.md },
          pressed && { backgroundColor: c.surfaceAlt },
        ]}
      >
        <History size={18} color={c.textMuted} strokeWidth={1.75} />
        <Text tone="muted">{t('All sessions')}</Text>
      </Pressable>
    </View>
  )
}

const DrawerRow = memo(function DrawerRow({
  row,
  current,
  onOpen,
}: {
  row: SessionRow
  current: boolean
  onOpen: (row: SessionRow) => void
}) {
  const { c } = useTheme()
  const t = useT()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: current }}
      onPress={() => onOpen(row)}
      style={({ pressed }) => [styles.row, { backgroundColor: current ? c.accentSoft : pressed ? c.surfaceAlt : 'transparent' }]}
    >
      <View style={{ flex: 1, gap: 1 }}>
        <Text weight={current ? 'semibold' : 'regular'} numberOfLines={1}>
          {row.title || row.preview || t('Untitled')}
        </Text>
        <Text variant="caption" tone="faint" numberOfLines={1}>
          {[relativeTime(row.last_active ?? row.started_at), row.source].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {row.is_active ? <View style={[styles.dot, { backgroundColor: c.success }]} /> : null}
      {row.pinned ? <Pin size={13} color={c.textFaint} strokeWidth={1.75} /> : null}
    </Pressable>
  )
})

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  backend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    minHeight: 56,
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg + space.xs, minHeight: 44 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  newChat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.md,
    marginBottom: space.sm,
    paddingHorizontal: space.md,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.md,
    marginBottom: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.sm,
    paddingHorizontal: space.md,
    minHeight: 52,
    borderRadius: radius.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
})
