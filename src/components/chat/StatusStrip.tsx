import { CheckCircle2, ChevronDown, ChevronUp, Circle, CircleDot, Users } from '@/components/icons'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'

import { Text } from '@/components/ui'
import { useT } from '@/i18n'
import type { Subagent, Todo } from '@/lib/chat/types'
import { radius, space, useTheme } from '@/theme'

function elapsed(since: number | null) {
  if (!since) return ''
  const s = Math.max(0, Math.round((Date.now() - since) / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

export function BusyLine({ status, since }: { status: string | null; since: number | null }) {
  const { c } = useTheme()
  const t = useT()
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <View style={styles.busy} accessibilityLiveRegion="polite">
      <ActivityIndicator size="small" color={c.accent} />
      <Text variant="small" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
        {status || t('Working…')}
      </Text>
      <Text variant="caption" tone="faint">
        {elapsed(since)}
      </Text>
    </View>
  )
}

export function TodoPanel({ todos }: { todos: Todo[] }) {
  const { c } = useTheme()
  const t = useT()
  const [open, setOpen] = useState(false)
  if (!todos.length) return null
  const done = todos.filter((x) => x.status === 'completed').length
  const current = todos.find((x) => x.status === 'in_progress')
  return (
    <View style={[styles.panel, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.panelHead}>
        <Text variant="small" weight="semibold">
          {t('Tasks {done}/{total}', { done, total: todos.length })}
        </Text>
        <Text variant="small" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
          {current?.content ?? ''}
        </Text>
        {open ? <ChevronDown size={16} color={c.textFaint} /> : <ChevronUp size={16} color={c.textFaint} />}
      </Pressable>
      {open ? (
        <View style={{ gap: 6, paddingHorizontal: space.md, paddingBottom: space.md }}>
          {todos.map((todo) => {
            const Icon = todo.status === 'completed' ? CheckCircle2 : todo.status === 'in_progress' ? CircleDot : Circle
            const color = todo.status === 'completed' ? c.success : todo.status === 'in_progress' ? c.accentText : c.textFaint
            return (
              <View key={todo.id} style={{ flexDirection: 'row', gap: space.sm, paddingLeft: todo.parent ? space.lg : 0 }}>
                <Icon size={16} color={color} style={{ marginTop: 2 }} />
                <Text variant="small" tone={todo.status === 'completed' ? 'muted' : 'default'} style={{ flex: 1 }}>
                  {todo.content}
                </Text>
              </View>
            )
          })}
        </View>
      ) : null}
    </View>
  )
}

export function SubagentChip({ subagents, onPress }: { subagents: Record<string, Subagent>; onPress: () => void }) {
  const { c } = useTheme()
  const t = useT()
  const list = Object.values(subagents)
  const running = list.filter((s) => s.status === 'running' || s.status === 'queued').length
  if (!list.length) return null
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={9} style={[styles.chip, { backgroundColor: c.infoSoft }]}>
      <Users size={14} color={c.info} />
      <Text variant="caption" weight="semibold" style={{ color: c.info }}>
        {running ? t('{n} subagents running', { n: running }) : t('{n} subagents', { n: list.length })}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  busy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
    minHeight: 32,
  },
  panel: { marginHorizontal: space.md, marginBottom: space.xs, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, minHeight: 48 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    height: 30,
    alignSelf: 'flex-start',
  },
})
