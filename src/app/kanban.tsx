import { useQuery } from '@tanstack/react-query'
import { router, Stack } from 'expo-router'
import { Archive, KanbanSquare, MessageSquare, Plus, Rocket, Send, Trash2, Undo2 } from '@/components/icons'
import * as Haptics from 'expo-haptics'
import { useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'

import {
  Badge,
  Button,
  Chip,
  confirm,
  EmptyState,
  ErrorState,
  IconButton,
  Loading,
  Screen,
  Sheet,
  Text,
  TextField,
  toast,
  toastError,
} from '@/components/ui'
import { useT } from '@/i18n'
import { relativeTime } from '@/lib/format'
import { useRest } from '@/lib/hooks'
import { rest } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { useSettings } from '@/store/settings'
import { radius, space, useTheme } from '@/theme'

const BASE = '/api/plugins/kanban'

/** Workflow column names come back lowercase from the backend; show proper labels. */
function columnLabel(t: (s: string) => string, name: string): string {
  switch (name) {
    case 'triage': return t('Triage')
    case 'todo': return t('To do')
    case 'scheduled': return t('Scheduled')
    case 'ready': return t('Ready')
    case 'running': return t('Running')
    case 'blocked': return t('Blocked')
    case 'review': return t('Review')
    case 'done': return t('Done')
    case 'archived': return t('Archived')
    default: return name
  }
}

interface Task {
  id: string
  title: string
  body?: string | null
  assignee?: string | null
  status: string
  priority?: number
  created_at?: number
  result?: string | null
  latest_summary?: string | null
  session_id?: string | null
  last_failure_error?: string | null
  block_reason?: string | null
}
interface Board {
  columns: { name: string; tasks: Task[] }[]
  assignees: string[]
}

export default function KanbanScreen() {
  const t = useT()
  const { c } = useTheme()
  const boards = useRest<{ boards: { slug: string; name: string; total?: number; is_current?: boolean }[]; current: string }>(
    ['kanban', 'boards'],
    `${BASE}/boards`,
  )
  const [slug, setSlug] = useState<string | null>(null)
  const board = slug ?? boards.data?.current ?? 'default'
  const q = useQuery({
    queryKey: ['kanban', 'board', board],
    enabled: !!boards.data,
    refetchInterval: 10_000,
    queryFn: () => rest().get<Board>(`${BASE}/board`, { query: { board } }),
  })
  const assignees = useRest<{ assignees: { name: string }[] }>(['kanban', 'assignees'], `${BASE}/assignees`)
  const [column, setColumn] = useState('ready')
  const [selected, setSelected] = useState<Task | null>(null)
  const [creating, setCreating] = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['kanban'] })
  const cols = q.data?.columns ?? []
  const tasks = cols.find((x) => x.name === column)?.tasks ?? []

  // Drag a card onto a column chip to move it. Chip rectangles are measured when a drag starts.
  const chipRefs = useRef<Record<string, View | null>>({})
  const rects = useRef<Record<string, { x: number; y: number; w: number; h: number }>>({})
  const rootRef = useRef<View>(null)
  const origin = useRef({ x: 0, y: 0 })
  const [drag, setDrag] = useState<{ task: Task } | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const ghostX = useSharedValue(0)
  const ghostY = useSharedValue(0)
  const ghostStyle = useAnimatedStyle(() => ({ transform: [{ translateX: ghostX.value }, { translateY: ghostY.value }] }))
  const columnAt = (x: number, y: number) =>
    Object.entries(rects.current).find(([, r]) => x >= r.x - 8 && x <= r.x + r.w + 8 && y >= r.y - 16 && y <= r.y + r.h + 16)?.[0] ?? null
  const dragApi = {
    start: (task: Task, x: number, y: number) => {
      rootRef.current?.measureInWindow((ox, oy) => (origin.current = { x: ox, y: oy }))
      for (const [name, ref] of Object.entries(chipRefs.current))
        ref?.measureInWindow((rx, ry, w, h) => (rects.current[name] = { x: rx, y: ry, w, h }))
      ghostX.value = x - origin.current.x - 24
      ghostY.value = y - origin.current.y + 36
      setDrag({ task })
      if (useSettings.getState().haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    },
    move: (x: number, y: number) => {
      ghostX.value = x - origin.current.x - 24
      ghostY.value = y - origin.current.y + 36
      const over = columnAt(x, y)
      setHover((h) => (h === over ? h : over))
    },
    end: async (x: number, y: number) => {
      const target = columnAt(x, y)
      const task = drag?.task
      setDrag(null)
      setHover(null)
      if (!task || !target || target === task.status) return
      try {
        await rest().patch(`${BASE}/tasks/${task.id}`, { status: target }, { query: { board } })
        toast(t('Moved to {col}', { col: columnLabel(t, target) }), 'success')
        if (useSettings.getState().haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      } catch (e) {
        toastError(e)
      }
      await refresh()
    },
    cancel: () => {
      setDrag(null)
      setHover(null)
    },
  }

  return (
    <View ref={rootRef} collapsable={false} style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: t('Kanban'),
          headerRight: () => <IconButton icon={Plus} label={t('New task')} onPress={() => setCreating(true)} />,
        }}
      />
      {(boards.data?.boards.length ?? 0) > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.chips}>
          {boards.data!.boards.map((b) => (
            <Chip key={b.slug} label={b.name} selected={b.slug === board} onPress={() => setSlug(b.slug)} />
          ))}
        </ScrollView>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.chips}>
        {cols.map((col) => (
          <View
            key={col.name}
            ref={(r) => {
              chipRefs.current[col.name] = r
            }}
            collapsable={false}
            style={[
              styles.dropTarget,
              !col.tasks.length && { opacity: 0.45 },
              drag && hover === col.name && col.name !== drag.task.status && { borderColor: c.accent, backgroundColor: c.accentSoft },
            ]}
          >
            <Chip label={`${columnLabel(t, col.name)} · ${col.tasks.length}`} selected={col.name === column} onPress={() => setColumn(col.name)} />
          </View>
        ))}
      </ScrollView>
      <Screen refreshing={q.isRefetching} onRefresh={refresh}>
        {q.isLoading ? <Loading /> : null}
        {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
        {!q.isLoading && !tasks.length ? <EmptyState icon={KanbanSquare} title={t('Nothing in {col}', { col: columnLabel(t, column) })} /> : null}
        {tasks.map((task) => (
          <DraggableTask key={task.id} task={task} dragging={drag?.task.id === task.id} onOpen={setSelected} drag={dragApi} />
        ))}
      </Screen>
      {drag ? (
        <Animated.View pointerEvents="none" style={[styles.ghost, { backgroundColor: c.elevated, borderColor: c.accent }, ghostStyle]}>
          <Text weight="semibold" numberOfLines={2}>
            {drag.task.title}
          </Text>
          <Text variant="caption" tone="muted">
            {hover && hover !== drag.task.status ? t('Drop to move to {col}', { col: columnLabel(t, hover) }) : t('Drag onto a column above')}
          </Text>
        </Animated.View>
      ) : null}
      <TaskSheet
        task={selected}
        board={board}
        columns={cols.map((x) => x.name)}
        assignees={(assignees.data?.assignees ?? []).map((a) => a.name)}
        onClose={() => setSelected(null)}
        onChanged={refresh}
      />
      <CreateTask
        visible={creating}
        board={board}
        assignees={(assignees.data?.assignees ?? []).map((a) => a.name)}
        onClose={() => setCreating(false)}
        onCreated={refresh}
      />
    </View>
  )
}

function TaskSheet({
  task,
  board,
  columns,
  assignees,
  onClose,
  onChanged,
}: {
  task: Task | null
  board: string
  columns: string[]
  assignees: string[]
  onClose: () => void
  onChanged: () => void
}) {
  const t = useT()
  const { c } = useTheme()
  const [comment, setComment] = useState('')
  const detail = useQuery({
    queryKey: ['kanban', 'task', task?.id],
    enabled: !!task,
    queryFn: () =>
      rest().get<{
        task: Task
        comments: { id: number; author: string; body: string; created_at: number }[]
        events: { id: number; kind: string; created_at?: number }[]
      }>(`${BASE}/tasks/${task!.id}`, { query: { board } }),
  })
  const d = detail.data?.task ?? task
  const act = (fn: () => Promise<unknown>, done?: string) => async () => {
    try {
      await fn()
      if (done) toast(done, 'success')
      await detail.refetch()
      onChanged()
    } catch (e) {
      toastError(e)
    }
  }
  const patch = (body: Record<string, unknown>) => rest().patch(`${BASE}/tasks/${task!.id}`, body, { query: { board } })

  return (
    <Sheet visible={!!task} onClose={onClose} title={d?.title}>
      {d?.body ? <Text>{d.body}</Text> : null}
      {d?.result ? (
        <View style={{ backgroundColor: c.successSoft, borderRadius: radius.md, padding: space.md }}>
          <Text variant="small">{d.result}</Text>
        </View>
      ) : null}
      {d?.last_failure_error || d?.block_reason ? (
        <Text variant="small" tone="danger">
          {d.last_failure_error || d.block_reason}
        </Text>
      ) : null}
      <Text variant="small" weight="semibold" tone="muted">
        {t('Status')}
      </Text>
      <View style={styles.wrap}>
        {columns.map((col) => (
          <Chip
            key={col}
            label={columnLabel(t, col)}
            selected={d?.status === col}
            onPress={act(() => patch({ status: col }), t('Moved to {col}', { col: columnLabel(t, col) }))}
          />
        ))}
      </View>
      <Text variant="small" weight="semibold" tone="muted">
        {t('Assignee')}
      </Text>
      <View style={styles.wrap}>
        <Chip label={t('nobody')} selected={!d?.assignee} onPress={act(() => patch({ assignee: '' }))} />
        {assignees.map((a) => (
          <Chip
            key={a}
            label={a}
            selected={d?.assignee === a}
            onPress={act(() => patch({ assignee: a }), t('Assigned to {name}', { name: a }))}
          />
        ))}
      </View>
      <View style={styles.wrap}>
        <Button
          size="sm"
          icon={Rocket}
          label={t('Dispatch workers')}
          onPress={act(() => rest().post(`${BASE}/dispatch`, {}, { query: { board } }), t('Dispatched'))}
        />
        {d?.status === 'running' ? (
          <Button
            size="sm"
            variant="secondary"
            icon={Undo2}
            label={t('Reclaim')}
            onPress={act(() => rest().post(`${BASE}/tasks/${task!.id}/reclaim`, {}, { query: { board } }), t('Reclaimed'))}
          />
        ) : null}
        {d?.session_id ? (
          <Button
            size="sm"
            variant="secondary"
            icon={MessageSquare}
            label={t('Open session')}
            onPress={() => (onClose(), router.navigate({ pathname: '/chat', params: { stored: d.session_id! } }))}
          />
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          icon={Archive}
          label={t('Archive')}
          onPress={act(
            () =>
              rest()
                .post(`${BASE}/tasks/bulk`, { ids: [task!.id], archive: true }, { query: { board } })
                .then(onClose),
            t('Archived'),
          )}
        />
        <Button
          size="sm"
          variant="dangerGhost"
          icon={Trash2}
          label={t('Delete')}
          onPress={async () => {
            if (await confirm(t('Delete this task?'), undefined, { destructive: true, confirmLabel: t('Delete') }))
              await act(() => rest().del(`${BASE}/tasks/${task!.id}`, undefined, { query: { board } }).then(onClose), t('Deleted'))()
          }}
        />
      </View>
      <Text weight="semibold">{t('Comments')}</Text>
      {(detail.data?.comments ?? []).map((cm) => (
        <View key={cm.id} style={{ backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: space.md, gap: 2 }}>
          <Text variant="caption" tone="faint">
            {cm.author} · {relativeTime(cm.created_at)}
          </Text>
          <Text variant="small">{cm.body}</Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <TextField value={comment} onChangeText={setComment} placeholder={t('Add a comment')} multiline minLines={1} />
        </View>
        <IconButton
          icon={Send}
          label={t('Send comment')}
          filled
          disabled={!comment.trim()}
          onPress={act(async () => {
            await rest().post(`${BASE}/tasks/${task!.id}/comments`, { body: comment.trim(), author: 'android' }, { query: { board } })
            setComment('')
          })}
        />
      </View>
      {detail.data?.events?.length ? (
        <Text variant="caption" tone="faint">
          {detail.data.events.map((e) => e.kind).join(' → ')}
        </Text>
      ) : null}
    </Sheet>
  )
}

function CreateTask({
  visible,
  board,
  assignees,
  onClose,
  onCreated,
}: {
  visible: boolean
  board: string
  assignees: string[]
  onClose: () => void
  onCreated: () => void
}) {
  const t = useT()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [assignee, setAssignee] = useState<string | null>(null)
  const [priority, setPriority] = useState(0)
  const [triage, setTriage] = useState(false)
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    try {
      await rest().post(
        `${BASE}/tasks`,
        { title: title.trim(), body: body.trim() || null, assignee, priority, triage },
        { query: { board } },
      )
      toast(t('Task created'), 'success')
      setTitle('')
      setBody('')
      onCreated()
      onClose()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('New task')}
      footer={<Button label={t('Create task')} onPress={create} loading={busy} disabled={!title.trim()} />}
    >
      <TextField label={t('Title')} value={title} onChangeText={setTitle} />
      <TextField label={t('Details')} value={body} onChangeText={setBody} multiline minLines={4} />
      <Text variant="small" weight="medium" tone="muted">
        {t('Assign to a profile')}
      </Text>
      <View style={styles.wrap}>
        <Chip label={t('nobody')} selected={!assignee} onPress={() => setAssignee(null)} />
        {assignees.map((a) => (
          <Chip key={a} label={a} selected={assignee === a} onPress={() => setAssignee(a)} />
        ))}
      </View>
      <Text variant="small" weight="medium" tone="muted">
        {t('Priority')}
      </Text>
      <View style={styles.wrap}>
        {[0, 1, 2, 3].map((p) => (
          <Chip key={p} label={`P${p}`} selected={priority === p} onPress={() => setPriority(p)} />
        ))}
        <Chip label={t('Needs triage')} selected={triage} onPress={() => setTriage(!triage)} />
      </View>
    </Sheet>
  )
}

interface DragApi {
  start: (task: Task, x: number, y: number) => void
  move: (x: number, y: number) => void
  end: (x: number, y: number) => void
  cancel: () => void
}

/** A task card: tap opens it, long-press lifts it so it can be dropped on a column chip. */
function DraggableTask({ task, dragging, onOpen, drag }: { task: Task; dragging: boolean; onOpen: (t: Task) => void; drag: DragApi }) {
  const t = useT()
  const { c } = useTheme()
  const api = useRef(drag)
  api.current = drag
  const gesture = useMemo(
    () =>
      Gesture.Exclusive(
        Gesture.Pan()
          .runOnJS(true)
          .activateAfterLongPress(320)
          .onStart((e) => api.current.start(task, e.absoluteX, e.absoluteY))
          .onUpdate((e) => api.current.move(e.absoluteX, e.absoluteY))
          .onEnd((e) => api.current.end(e.absoluteX, e.absoluteY))
          .onFinalize((_e, ok) => !ok && api.current.cancel()),
        Gesture.Tap()
          .runOnJS(true)
          // Open on the next tick: a browser's follow-up click would otherwise land on the new
          // sheet's backdrop and close it straight away.
          .onEnd((_e, ok) => {
            if (ok) setTimeout(() => onOpen(task), 60)
          }),
      ),
    [task, onOpen],
  )
  return (
    <GestureDetector gesture={gesture}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={task.title}
        accessibilityHint={t('Long-press and drag onto a column to move it')}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={() => onOpen(task)}
        style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, opacity: dragging ? 0.35 : 1 }]}
      >
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          <Text weight="semibold" style={{ flex: 1 }} numberOfLines={2}>
            {task.title}
          </Text>
          {task.priority ? <Badge label={`P${task.priority}`} tone={task.priority >= 2 ? 'warn' : 'default'} /> : null}
        </View>
        {task.latest_summary || task.body ? (
          <Text variant="small" tone="muted" numberOfLines={2}>
            {task.latest_summary || task.body}
          </Text>
        ) : null}
        <Text variant="caption" tone="faint">
          {[task.assignee ?? t('unassigned'), relativeTime(task.created_at)].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  dropTarget: { borderRadius: radius.pill, borderWidth: 1.5, borderColor: 'transparent', padding: 2 },
  ghost: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 240,
    padding: space.md,
    gap: 4,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    zIndex: 50,
  },
  chips: { gap: space.xs, paddingHorizontal: space.lg, paddingVertical: space.sm },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.md, gap: space.xs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
})
