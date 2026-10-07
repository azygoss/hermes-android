import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import {
  Archive,
  ArchiveRestore,
  CheckCheck,
  CheckSquare,
  Download,
  EyeOff,
  GitBranch,
  History,
  type LucideIcon,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  Search,
  Square,
  Trash2,
  X,
} from '@/components/icons'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, BackHandler, Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native'
import { Pressable as GHPressable } from 'react-native-gesture-handler'
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

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
import { previewText } from '@/lib/chat/history'
import { relativeTime, sourceLabel } from '@/lib/format'
import { rest, rpc, useRuntime } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { closeRuntime, useChat } from '@/store/chat'
import { centered, space, useTheme } from '@/theme'

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
  const [filter, setFilter] = useState<'recent' | 'scheduled' | 'archived'>('recent')
  const [search, setSearch] = useState('')
  // Keystrokes do not hit the API; results below swap in only once this settles.
  const [term, setTerm] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [selected, setSelected] = useState<SessionRow | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setTerm(search), 300)
    return () => clearTimeout(id)
  }, [search])

  const list = useInfiniteQuery({
    queryKey: ['sessions', filter],
    enabled: connected,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      rest().get<{ sessions: SessionRow[]; total: number }>('/api/sessions', {
        query: {
          limit: PAGE,
          offset: pageParam,
          order: 'recent',
          archived: filter === 'archived' ? 'only' : 'exclude',
          min_messages: 1,
          ...(filter === 'recent' ? { exclude_sources: 'cron' } : filter === 'scheduled' ? { source: 'cron' } : {}),
        },
      }),
    getNextPageParam: (last, pages) => (last.sessions.length < PAGE ? undefined : pages.length * PAGE),
  })

  const searching = term.trim().length > 1
  const searchQuery = useQuery({
    queryKey: ['sessions', 'search', term],
    enabled: connected && searching,
    placeholderData: keepPreviousData,
    queryFn: () => rest().get<{ results: SessionRow[] }>('/api/sessions/search', { query: { q: term.trim(), limit: 40 } }),
  })

  const rows = useMemo(() => {
    if (searching) {
      const seen = new Set<string>()
      return (searchQuery.data?.results ?? []).filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    }
    const all = list.data?.pages.flatMap((p) => p.sessions) ?? []
    return [...all.filter((s) => s.pinned), ...all.filter((s) => !s.pinned)]
  }, [list.data, searchQuery.data, searching])

  const sections = useMemo(() => groupByDay(rows, searching, t), [rows, searching, t])

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

  /** Delete one or many chats after one confirmation; open ones are closed first. */
  async function remove(targets: SessionRow[]) {
    if (!targets.length) return false
    const ok = await confirm(
      targets.length === 1 ? t('Delete this chat?') : t('Delete {n} chats?', { n: targets.length }),
      t('The transcript is removed from the backend.'),
      { destructive: true, confirmLabel: t('Delete') },
    )
    if (!ok) return false
    try {
      for (const row of targets) {
        const rid = useChat.getState().storedToRuntime[row.id]
        if (rid) await closeRuntime(rid)
        await rest().del(`/api/sessions/${encodeURIComponent(row.id)}`)
      }
      toast(targets.length === 1 ? t('Deleted') : t('{n} chats deleted', { n: targets.length }), 'success')
    } catch (e) {
      toastError(e)
    }
    await queryClient.invalidateQueries({ queryKey: ['sessions'] })
    return true
  }

  async function patchMany(targets: SessionRow[], body: Record<string, unknown>, message: string) {
    try {
      for (const row of targets) await rest().patch(`/api/sessions/${encodeURIComponent(row.id)}`, body)
      toast(message, 'success')
    } catch (e) {
      toastError(e)
    }
    await queryClient.invalidateQueries({ queryKey: ['sessions'] })
  }

  // Multi-select: null when off. Tapping a row toggles it while on.
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const selecting = picked !== null
  const pickedRows = rows.filter((r) => picked?.has(r.id))
  const toggle = useCallback(
    (row: SessionRow) =>
      setPicked((cur) => {
        const next = new Set(cur ?? [])
        if (next.has(row.id)) next.delete(row.id)
        else next.add(row.id)
        return next
      }),
    [],
  )
  useEffect(() => setPicked(null), [filter, search])
  useEffect(() => {
    if (!selecting) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => (setPicked(null), true))
    return () => sub.remove()
  }, [selecting])

  const swipe = useCallback(
    async (action: 'archive' | 'pin' | 'delete', row: SessionRow) => {
      if (action === 'delete') return void remove([row])
      if (action === 'pin') return patch(row, { pinned: !row.pinned }, row.pinned ? t('Unpinned') : t('Pinned'))
      return patch(row, { archived: !row.archived }, row.archived ? t('Restored') : t('Archived'))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  )

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {selecting ? (
        <SelectionBar
          count={pickedRows.length}
          archived={filter === 'archived'}
          onCancel={() => setPicked(null)}
          onAll={() => setPicked(new Set(rows.map((r) => r.id)))}
          onPin={() => patchMany(pickedRows, { pinned: true }, t('Pinned')).then(() => setPicked(null))}
          onArchive={() =>
            patchMany(pickedRows, { archived: filter !== 'archived' }, filter === 'archived' ? t('Restored') : t('Archived')).then(() =>
              setPicked(null),
            )
          }
          onDelete={() => remove(pickedRows).then((done) => done && setPicked(null))}
        />
      ) : null}
      {selecting ? null : (
        <TabHeader
          title={t('Sessions')}
          subtitle={list.data ? t('{n} conversations', { n: list.data.pages[0]?.total ?? rows.length }) : undefined}
          right={<IconButton icon={Search} label={t('Search sessions')} onPress={() => setSearchOpen(!searchOpen)} active={searchOpen} />}
        />
      )}
      <View style={[centered, { paddingHorizontal: space.lg, gap: space.sm, paddingBottom: space.sm }]}>
        {searchOpen ? (
          <TextField placeholder={t('Search all messages')} value={search} onChangeText={setSearch} autoFocus returnKeyType="search" />
        ) : null}
        {!search ? (
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'recent', label: t('Recent') },
              { value: 'scheduled', label: t('Scheduled') },
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
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.id}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) =>
          section.title ? (
            <View style={[styles.dayHead, { backgroundColor: c.bg }]}>
              <Text variant="small" weight="semibold" tone="muted" accessibilityRole="header">
                {section.title}
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={[centered, { paddingBottom: space.xxxl }]}
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
        extraData={picked}
        renderItem={({ item }) => (
          <SessionCard
            row={item}
            onOpen={selecting ? toggle : open}
            onMenu={selecting ? toggle : setSelected}
            selecting={selecting}
            checked={!!picked?.has(item.id)}
            onSwipe={swipe}
          />
        )}
      />
      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={previewText(selected?.title || selected?.preview) || t('Session')}>
        {selected ? (
          <View style={{ marginHorizontal: -space.lg }}>
            <Row icon={MessageSquare} title={t('Open')} onPress={() => (setSelected(null), open(selected))} />
            <Row
              icon={CheckSquare}
              title={t('Select several')}
              subtitle={t('Pin, archive or delete many chats at once')}
              onPress={() => {
                const id = selected.id
                setSelected(null)
                setPicked(new Set([id]))
              }}
            />
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
              onPress={() => {
                const row = selected
                setSelected(null)
                void remove([row])
              }}
            />
          </View>
        ) : null}
      </Sheet>
    </View>
  )
}

const DAY = 86_400_000

/** Pinned first, then Today / Yesterday / Previous 7 days / Earlier, like the desktop sidebar. */
function groupByDay(rows: SessionRow[], searching: boolean, t: ReturnType<typeof useT>) {
  if (searching) return rows.length ? [{ title: '', data: rows }] : []
  const midnight = new Date().setHours(0, 0, 0, 0)
  const buckets: { title: string; data: SessionRow[] }[] = [
    { title: t('Pinned'), data: [] },
    { title: t('Today'), data: [] },
    { title: t('Yesterday'), data: [] },
    { title: t('Previous 7 days'), data: [] },
    { title: t('Earlier'), data: [] },
  ]
  for (const row of rows) {
    const ts = row.last_active ?? row.started_at ?? 0
    const ms = ts < 1e12 ? ts * 1000 : ts
    const i = row.pinned ? 0 : ms >= midnight ? 1 : ms >= midnight - DAY ? 2 : ms >= midnight - 7 * DAY ? 3 : 4
    buckets[i].data.push(row)
  }
  return buckets.filter((b) => b.data.length)
}

const SWIPE_ACTION = 76
const openRow: { current: SwipeableMethods | null } = { current: null }

const SessionCard = memo(function SessionCard({
  row,
  onOpen,
  onMenu,
  selecting,
  checked,
  onSwipe,
}: {
  row: SessionRow
  onOpen: (row: SessionRow) => void
  onMenu: (row: SessionRow) => void
  selecting: boolean
  checked: boolean
  onSwipe: (action: 'archive' | 'pin' | 'delete', row: SessionRow) => void
}) {
  const swipeRef = useRef<SwipeableMethods>(null)
  const { c } = useTheme()
  const t = useT()
  const title = previewText(row.title || row.preview) || t('Untitled')
  const snippet = row.snippet?.replace(/>>>|<<</g, '')
  const body = snippet || (row.preview && row.preview !== (row.title || row.preview) ? previewText(row.preview) : null)
  const meta = [
    sourceLabel(row.source) || null,
    row.message_count ? t('{n} messages', { n: row.message_count }) : null,
    row.profile && row.profile !== 'default' ? row.profile : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const action =
    (label: string, Icon: LucideIcon, bg: string, fg: string, kind: 'archive' | 'pin' | 'delete') => (methods: SwipeableMethods) => (
      <GHPressable
        key={kind}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => {
          methods.close()
          onSwipe(kind, row)
        }}
        style={[styles.swipeAction, { backgroundColor: bg }]}
      >
        <Icon size={20} color={fg} strokeWidth={1.75} />
        <Text variant="caption" weight="medium" style={{ color: fg }}>
          {label}
        </Text>
      </GHPressable>
    )
  const archive = action(row.archived ? t('Restore') : t('Archive'), row.archived ? ArchiveRestore : Archive, c.elevated, c.text, 'archive')
  const remove = action(t('Delete'), Trash2, c.danger, '#FFFFFF', 'delete')
  const pin = action(row.pinned ? t('Unpin') : t('Pin'), row.pinned ? PinOff : Pin, c.accent, c.onAccent, 'pin')
  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      onSwipeableWillOpen={() => {
        // One open row at a time, like the system lists.
        if (openRow.current && openRow.current !== swipeRef.current) openRow.current.close()
        openRow.current = swipeRef.current
      }}
      enabled={!selecting}
      friction={1.6}
      rightThreshold={SWIPE_ACTION / 2}
      overshootRight={false}
      // All actions on one side: the library stacks both sides' containers over the row, so a
      // left set would sit under the (transparent) right one and never get the tap.
      renderRightActions={(_p, _t, methods) => (
        <View style={{ flexDirection: 'row' }}>
          {pin(methods)}
          {archive(methods)}
          {remove(methods)}
        </View>
      )}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${relativeTime(row.last_active ?? row.started_at)}`}
        accessibilityHint={selecting ? undefined : t('Long-press for more actions')}
        accessibilityState={selecting ? { checked } : undefined}
        onPress={() => onOpen(row)}
        onLongPress={() => onMenu(row)}
        android_ripple={{ color: c.surfaceAlt }}
        style={({ pressed }) => [styles.row, { backgroundColor: checked ? c.accentSoft : pressed ? c.surface : c.bg }]}
      >
        <View style={styles.marker}>
          {selecting ? (
            checked ? (
              <CheckSquare size={20} color={c.accentText} strokeWidth={2} />
            ) : (
              <Square size={20} color={c.textFaint} strokeWidth={1.75} />
            )
          ) : null}
          {selecting ? null : row.is_active ? (
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
    </ReanimatedSwipeable>
  )
})

/** Replaces the header while picking chats: count, select all, and the bulk actions. */
function SelectionBar({
  count,
  archived,
  onCancel,
  onAll,
  onPin,
  onArchive,
  onDelete,
}: {
  count: number
  archived: boolean
  onCancel: () => void
  onAll: () => void
  onPin: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const t = useT()
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.selectBar, { paddingTop: insets.top + space.xs, borderBottomColor: c.border, backgroundColor: c.bg }]}>
      <IconButton icon={X} label={t('Stop selecting')} onPress={onCancel} />
      <Text variant="title" style={{ flex: 1 }} accessibilityLiveRegion="polite">
        {t('{n} selected', { n: count })}
      </Text>
      <IconButton icon={CheckCheck} label={t('Select all')} onPress={onAll} />
      <IconButton icon={Pin} label={t('Pin')} onPress={onPin} disabled={!count} />
      <IconButton
        icon={archived ? ArchiveRestore : Archive}
        label={archived ? t('Restore from archive') : t('Archive')}
        onPress={onArchive}
        disabled={!count}
      />
      <IconButton icon={Trash2} label={t('Delete')} onPress={onDelete} disabled={!count} color={c.danger} />
    </View>
  )
}

function Separator() {
  const { c } = useTheme()
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginLeft: space.lg + 14 }} />
}

const styles = StyleSheet.create({
  swipeAction: { width: SWIPE_ACTION, alignItems: 'center', justifyContent: 'center', gap: 4 },
  selectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: space.xs,
    paddingBottom: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayHead: { paddingLeft: space.lg + 14, paddingRight: space.lg, paddingTop: space.lg, paddingBottom: space.xs },
  row: { flexDirection: 'row', paddingVertical: space.md, paddingRight: space.lg },
  marker: { width: space.lg + 14, alignItems: 'center', paddingTop: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
})
