import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { Archive, ArchiveRestore, Download, History, MessageSquare, Pencil, Pin, PinOff, Search, Trash2 } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native'

import { TabHeader } from '@/components/TabHeader'
import {
  Badge,
  confirm,
  EmptyState,
  ErrorState,
  IconButton,
  prompt,
  Row,
  Segmented,
  Sheet,
  Text,
  TextField,
  toast,
  toastError,
} from '@/components/ui'
import { useT } from '@/i18n'
import { relativeTime } from '@/lib/format'
import { rest, useRuntime } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { closeRuntime, useChat } from '@/store/chat'
import { radius, space, useTheme } from '@/theme'

export interface SessionRow {
  id: string
  title?: string | null
  preview?: string | null
  source?: string | null
  message_count?: number
  last_active?: number
  started_at?: number
  is_active?: boolean
  pinned?: boolean
  archived?: boolean
  unread?: boolean
  model?: string | null
  snippet?: string
  profile?: string
}

const PAGE = 40

export default function SessionsScreen() {
  const t = useT()
  const { c } = useTheme()
  const connected = useRuntime((s) => !!s.hermes)
  const [filter, setFilter] = useState<'recent' | 'archived'>('recent')
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [selected, setSelected] = useState<SessionRow | null>(null)

  const list = useInfiniteQuery({
    queryKey: ['sessions', filter],
    enabled: connected,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      rest().get<{ sessions: SessionRow[]; total: number }>('/api/sessions', {
        query: { limit: PAGE, offset: pageParam, order: 'recent', archived: filter === 'archived' ? 'only' : 'exclude', min_messages: 1 },
      }),
    getNextPageParam: (last, pages) => (last.sessions.length < PAGE ? undefined : pages.length * PAGE),
  })

  const searchQuery = useQuery({
    queryKey: ['sessions', 'search', search],
    enabled: connected && search.trim().length > 1,
    queryFn: () => rest().get<{ results: SessionRow[] }>('/api/sessions/search', { query: { q: search.trim(), limit: 40 } }),
  })

  const rows = useMemo(() => {
    if (search.trim().length > 1) {
      const seen = new Set<string>()
      return (searchQuery.data?.results ?? []).filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    }
    const all = list.data?.pages.flatMap((p) => p.sessions) ?? []
    return [...all.filter((s) => s.pinned), ...all.filter((s) => !s.pinned)]
  }, [list.data, searchQuery.data, search])

  const open = (row: SessionRow) => router.navigate({ pathname: '/chat', params: { stored: row.id } })

  async function patch(row: SessionRow, body: Record<string, unknown>, message: string) {
    try {
      await rest().patch(`/api/sessions/${encodeURIComponent(row.id)}`, body)
      toast(message, 'success')
      await queryClient.invalidateQueries({ queryKey: ['sessions'] })
    } catch (e) {
      toastError(e)
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TabHeader
        title={t('Sessions')}
        subtitle={list.data ? t('{n} conversations', { n: list.data.pages[0]?.total ?? rows.length }) : undefined}
        right={<IconButton icon={Search} label={t('Search sessions')} onPress={() => setSearchOpen(!searchOpen)} active={searchOpen} />}
      />
      <View style={{ paddingHorizontal: space.lg, gap: space.sm, paddingBottom: space.sm }}>
        {searchOpen ? (
          <TextField placeholder={t('Search all messages')} value={search} onChangeText={setSearch} autoFocus returnKeyType="search" />
        ) : null}
        {!search ? (
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'recent', label: t('Recent') },
              { value: 'archived', label: t('Archived') },
            ]}
          />
        ) : null}
      </View>
      {list.error && !rows.length ? (
        <View style={{ padding: space.lg }}>
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        </View>
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.sm }}
        refreshControl={
          <RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} tintColor={c.accent} colors={[c.accent]} />
        }
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          list.isFetchingNextPage || list.isLoading || searchQuery.isFetching ? (
            <ActivityIndicator color={c.accent} style={{ margin: space.lg }} />
          ) : null
        }
        ListEmptyComponent={
          !list.isLoading && !searchQuery.isFetching ? (
            <EmptyState
              icon={History}
              title={search ? t('No matches') : t('No conversations yet')}
              body={search ? undefined : t('Chats from every Hermes surface (app, desktop, Telegram, cron…) show up here.')}
            />
          ) : null
        }
        renderItem={({ item }) => <SessionCard row={item} onPress={() => open(item)} onLongPress={() => setSelected(item)} />}
      />
      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.title || selected?.preview || t('Session')}>
        {selected ? (
          <View style={{ marginHorizontal: -space.lg }}>
            <Row icon={MessageSquare} title={t('Open')} onPress={() => (setSelected(null), open(selected))} />
            <Row
              icon={Pencil}
              title={t('Rename')}
              onPress={async () => {
                setSelected(null)
                const title = await prompt(t('Rename chat'), { initial: selected.title ?? '' })
                if (title) await patch(selected, { title }, t('Renamed'))
              }}
            />
            <Row
              icon={selected.pinned ? PinOff : Pin}
              title={selected.pinned ? t('Unpin') : t('Pin')}
              onPress={() => (
                setSelected(null),
                patch(selected, { pinned: !selected.pinned }, selected.pinned ? t('Unpinned') : t('Pinned'))
              )}
            />
            <Row
              icon={selected.archived ? ArchiveRestore : Archive}
              title={selected.archived ? t('Restore from archive') : t('Archive')}
              onPress={() => (
                setSelected(null),
                patch(selected, { archived: !selected.archived }, selected.archived ? t('Restored') : t('Archived'))
              )}
            />
            <Row
              icon={Download}
              title={t('Import from Claude Code / Codex')}
              subtitle={t('Bring sessions from other agents on the backend')}
              onPress={() => (setSelected(null), router.push('/import'))}
            />
            <Row
              icon={Trash2}
              danger
              title={t('Delete')}
              last
              onPress={async () => {
                const row = selected
                setSelected(null)
                if (
                  !(await confirm(t('Delete this chat?'), t('The transcript is removed from the backend.'), {
                    destructive: true,
                    confirmLabel: t('Delete'),
                  }))
                )
                  return
                try {
                  const rid = useChat.getState().storedToRuntime[row.id]
                  if (rid) await closeRuntime(rid)
                  await rest().del(`/api/sessions/${encodeURIComponent(row.id)}`)
                  toast(t('Deleted'), 'success')
                  await queryClient.invalidateQueries({ queryKey: ['sessions'] })
                } catch (e) {
                  toastError(e)
                }
              }}
            />
          </View>
        ) : null}
      </Sheet>
    </View>
  )
}

function SessionCard({ row, onPress, onLongPress }: { row: SessionRow; onPress: () => void; onLongPress: () => void }) {
  const { c } = useTheme()
  const t = useT()
  const title = row.title || row.preview || t('Untitled')
  const snippet = row.snippet?.replace(/>>>|<<</g, '')
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${relativeTime(row.last_active ?? row.started_at)}`}
      accessibilityHint={t('Long-press for more actions')}
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: c.accentSoft }}
      style={({ pressed }) => [styles.card, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {row.pinned ? <Pin size={14} color={c.accentText} /> : null}
        {row.is_active ? <View style={[styles.live, { backgroundColor: c.success }]} accessibilityLabel={t('Live')} /> : null}
        <Text weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </Text>
        <Text variant="caption" tone="faint">
          {relativeTime(row.last_active ?? row.started_at)}
        </Text>
      </View>
      {snippet || (row.preview && row.preview !== title) ? (
        <Text variant="small" tone="muted" numberOfLines={2}>
          {snippet || row.preview}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }}>
        {row.source ? <Badge label={row.source} tone={row.source === 'android' ? 'accent' : 'default'} /> : null}
        {row.message_count ? <Badge label={t('{n} msgs', { n: row.message_count })} /> : null}
        {row.unread ? <Badge label={t('unread')} tone="info" /> : null}
        {row.profile && row.profile !== 'default' ? <Badge label={row.profile} tone="info" /> : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.md, gap: 6 },
  live: { width: 8, height: 8, borderRadius: 4 },
})
