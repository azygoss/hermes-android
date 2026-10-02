import * as Clipboard from 'expo-clipboard'
import { CheckCircle2, ChevronDown, ChevronRight, Circle, CircleDot, FolderOpen, XCircle } from '@/components/icons'
import { router } from 'expo-router'
import { memo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { Text } from '@/components/ui'
import { useT } from '@/i18n'
import { formatDuration, imagesIn, resultText, toolFilePath, toolIcon, toolLabel, toolPreview } from '@/lib/chat/tools'
import type { ToolPart } from '@/lib/chat/types'
import { useChat } from '@/store/chat'
import { useSettings } from '@/store/settings'
import { radius, space, useTheme } from '@/theme'

import { RemoteImage } from './RemoteImage'
import { TextViewer } from './TextViewer'

function DiffView({ diff }: { diff: string }) {
  const { c } = useTheme()
  const lines = diff
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split('\n')
    .slice(0, 400)
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ paddingVertical: space.xs }}>
        {lines.map((line, i) => {
          const add = line.startsWith('+') && !line.startsWith('+++')
          const del = line.startsWith('-') && !line.startsWith('---')
          return (
            <Text
              key={i}
              mono
              variant="caption"
              style={{
                color: add ? c.success : del ? c.danger : line.startsWith('@@') ? c.info : c.textMuted,
                backgroundColor: add ? c.successSoft : del ? c.dangerSoft : 'transparent',
                paddingHorizontal: space.sm,
              }}
            >
              {line || ' '}
            </Text>
          )
        })}
      </View>
    </ScrollView>
  )
}

function TodoList({ todos }: { todos: { content?: string; status?: string }[] }) {
  const { c } = useTheme()
  return (
    <View style={{ gap: 4 }}>
      {todos.map((todo, i) => {
        const Icon = todo.status === 'completed' ? CheckCircle2 : todo.status === 'in_progress' ? CircleDot : Circle
        const color = todo.status === 'completed' ? c.success : todo.status === 'in_progress' ? c.accentText : c.textFaint
        return (
          <View key={i} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
            <Icon size={16} color={color} style={{ marginTop: 2 }} />
            <Text
              variant="small"
              style={{ flex: 1, textDecorationLine: todo.status === 'completed' ? 'line-through' : 'none' }}
              tone={todo.status === 'completed' ? 'muted' : 'default'}
            >
              {todo.content}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

function Block({ label, text, title }: { label: string; text: string; title: string }) {
  const { c } = useTheme()
  const t = useT()
  const [full, setFull] = useState(false)
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
        <Text variant="caption" tone="faint" weight="medium" style={{ flex: 1 }}>
          {label}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Open {what} full screen', { what: label })}
          hitSlop={12}
          onPress={() => setFull(true)}
        >
          <Text variant="caption" tone="accent">
            {t('Open')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Copy {what}', { what: label })}
          hitSlop={12}
          onPress={() => Clipboard.setStringAsync(text)}
        >
          <Text variant="caption" tone="accent">
            {t('Copy')}
          </Text>
        </Pressable>
      </View>
      {full ? <TextViewer visible onClose={() => setFull(false)} title={`${title} · ${label}`} text={text} /> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.pre, { backgroundColor: c.codeBg }]}>
        <Text mono variant="caption" selectable style={{ padding: space.sm }}>
          {text.length > 6000 ? `${text.slice(0, 6000)}\n…` : text}
        </Text>
      </ScrollView>
    </View>
  )
}

export const ToolCard = memo(function ToolCard({ part }: { part: ToolPart }) {
  const { c } = useTheme()
  const t = useT()
  const expandTools = useSettings((s) => s.expandTools)
  const [open, setOpen] = useState(expandTools)
  const Icon = toolIcon(part.name)
  const preview = toolPreview(part)
  const todos =
    (part.name === 'todo_list' || part.name === 'todo') && part.result && typeof part.result === 'object'
      ? ((part.result as { todos?: { content?: string; status?: string }[] }).todos ?? (part.args as { todos?: [] } | null)?.todos)
      : null
  const images = part.status === 'done' ? imagesIn(part.result) : []
  const out = part.status !== 'running' ? resultText(part) : ''
  const StatusIcon = part.status === 'error' ? XCircle : CheckCircle2
  const cwd = useChat((st) => (st.activeId ? st.sessions[st.activeId]?.info?.cwd : undefined))
  const file = toolFilePath(part, typeof cwd === 'string' ? cwd : null)

  return (
    <View style={[styles.card, { borderColor: part.status === 'error' ? c.danger : c.border, backgroundColor: c.surface }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${toolLabel(part.name)} ${preview}`}
        accessibilityState={{ expanded: open, busy: part.status === 'running' }}
        onPress={() => setOpen(!open)}
        android_ripple={{ color: c.surfaceAlt }}
        style={styles.head}
      >
        <Icon size={16} color={c.textMuted} strokeWidth={1.75} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="small" weight="semibold" numberOfLines={1}>
            {toolLabel(part.name)}
          </Text>
          {preview ? (
            <Text variant="caption" tone="muted" mono numberOfLines={open ? 6 : 1}>
              {preview}
            </Text>
          ) : null}
        </View>
        {part.duration ? (
          <Text variant="caption" tone="faint">
            {formatDuration(part.duration)}
          </Text>
        ) : null}
        {part.status === 'running' ? (
          <ActivityIndicator size="small" color={c.accent} />
        ) : (
          <StatusIcon size={16} color={part.status === 'error' ? c.danger : c.textFaint} strokeWidth={1.75} />
        )}
        {open ? <ChevronDown size={16} color={c.textFaint} /> : <ChevronRight size={16} color={c.textFaint} />}
      </Pressable>
      {file && part.status === 'done' ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('Open {name} in Files', { name: file.split('/').pop() ?? file })}
          onPress={() => router.push({ pathname: '/files', params: { file } })}
          hitSlop={8}
          style={({ pressed }) => [styles.fileLink, pressed && { opacity: 0.6 }]}
        >
          <FolderOpen size={14} color={c.accentText} strokeWidth={1.75} />
          <Text variant="caption" tone="accent" numberOfLines={1} style={{ flexShrink: 1 }}>
            {t('Open {name}', { name: file.split('/').pop() ?? file })}
          </Text>
        </Pressable>
      ) : null}

      {todos?.length ? (
        <View style={styles.body}>
          <TodoList todos={todos} />
        </View>
      ) : null}
      {images.length ? (
        <ScrollView horizontal contentContainerStyle={{ gap: space.sm, padding: space.md, paddingTop: 0 }}>
          {images.map((src) => (
            <RemoteImage key={src} src={src} />
          ))}
        </ScrollView>
      ) : null}
      {part.diff && !open ? (
        <View style={[styles.body, { maxHeight: 220, overflow: 'hidden' }]}>
          <DiffView diff={part.diff} />
        </View>
      ) : null}

      {open ? (
        <View style={styles.body}>
          {part.summary ? (
            <Text variant="small" tone="muted">
              {part.summary}
            </Text>
          ) : null}
          {part.args && Object.keys(part.args).length ? (
            <Block label={t('Input')} title={toolLabel(part.name)} text={JSON.stringify(part.args, null, 2)} />
          ) : null}
          {part.diff ? <DiffView diff={part.diff} /> : null}
          {out ? <Block label={part.status === 'error' ? t('Error') : t('Output')} title={toolLabel(part.name)} text={out} /> : null}
          {part.status === 'running' ? (
            <Text variant="caption" tone="muted">
              {t('Running…')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, overflow: 'hidden' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    minHeight: 48,
    paddingVertical: space.sm,
  },
  body: { paddingHorizontal: space.md, paddingBottom: space.md, gap: space.sm },
  pre: { borderRadius: radius.sm, maxHeight: 320 },
  fileLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, paddingBottom: space.sm, minHeight: 32 },
})
