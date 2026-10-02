import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import {
  Archive,
  ArchiveRestore,
  Download,
  EyeOff,
  GitBranch,
  History,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  Search,
  Trash2,
} from 'lucide-react-native'
import { memo, useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native'

import { TabHeader } from '@/components/TabHeader'
import {
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
import { rest, rpc, useRuntime } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { closeRuntime, useChat } from '@/store/chat'
import { space, useTheme } from '@/theme'

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

  const open = useCallback((row: SessionRow) => router.navigate({ pathname: '/chat', params: { stored: row.id } }), [])

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
        contentContainerStyle={{ paddingBottom: space.xxxl }}
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
        ItemSeparatorComponent={Separator}
        renderItem={({ item }) => <SessionCard row={item} onOpen={open} onMenu={setSelected} />}
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
              icon={GitBranch}
              title={t('Branch into a new chat')}
              onPress={async () => {
                const row = selected
                setSelected(null)
                try {
                  const res = await rpc().request('session.branch_stored', { parent_session_id: row.id, source: 'android', cols: 60 })
                  await queryClient.invalidateQueries({ queryKey: ['sessions'] })
                  router.navigate({ pathname: '/chat', params: { stored: res.stored_session_id } })
                } catch (e) {
                  toastError(e)
                }
              }}
            />
            <Row
              icon={EyeOff}
              title={t('Hide from the list')}
              subtitle={t('Still resumable; hidden chats stay out of recents')}
              onPress={async () => {
                const row = selected
                setSelected(null)
                try {
                  await rpc().request('session.set_hidden', { session_id: row.id, hidden: true })
                  toast(t('Hidden'), 'success')
                  await queryClient.invalidateQueries({ queryKey: ['sessions'] })
                } catch (e) {
                  toastError(e)
                }
              }}
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

const SessionCard = memo(function SessionCard({
  row,
  onOpen,
  onMenu,
}: {
  row: SessionRow
  onOpen: (row: SessionRow) => void
  onMenu: (row: SessionRow) => void
}) {
  const { c } = useTheme()
  const t = useT()
  const title = row.title || row.preview || t('Untitled')
  const snippet = row.snippet?.replace(/>>>|<<</g, '')
  const body = snippet || (row.preview && row.preview !== title ? row.preview : null)
  const meta = [
    row.source,
    row.message_count ? t('{n} messages', { n: row.message_count }) : null,
    row.profile && row.profile !== 'default' ? row.profile : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${relativeTime(row.last_active ?? row.started_at)}`}
      accessibilityHint={t('Long-press for more actions')}
      onPress={() => onOpen(row)}
      onLongPress={() => onMenu(row)}
      android_ripple={{ color: c.surfaceAlt }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surface }]}
    >
      <View style={styles.marker}>
        {row.is_active ? (
          <View style={[styles.dot, { backgroundColor: c.success }]} accessibilityLabel={t('Live')} />
        ) : row.unread ? (
          <View style={[styles.dot, { backgroundColor: c.accent }]} accessibilityLabel={t('unread')} />
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text weight="medium" numberOfLines={1} style={{ flex: 1 }}>
            {title}
          </Text>
          {row.pinned ? <Pin size={13} color={c.textFaint} strokeWidth={1.75} /> : null}
          <Text variant="caption" tone="faint">
            {relativeTime(row.last_active ?? row.started_at)}
          </Text>
        </View>
        {body ? (
          <Text variant="small" tone="muted" numberOfLines={2}>
            {body}
          </Text>
        ) : null}
        {meta ? (
          <Text variant="caption" tone="faint" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
})

function Separator() {
  const { c } = useTheme()
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginLeft: space.lg + 14 }} />
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingVertical: space.md, paddingRight: space.lg },
  marker: { width: space.lg + 14, alignItems: 'center', paddingTop: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
})
