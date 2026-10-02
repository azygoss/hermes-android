import * as Clipboard from 'expo-clipboard'
import {
  AlertTriangle,
  Brain,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  FileText,
  Image as ImageIcon,
  Info,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  XCircle,
} from 'lucide-react-native'
import { memo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { Badge, Text, toast } from '@/components/ui'
import { useT } from '@/i18n'
import { textOf, type ChatMessage } from '@/lib/chat/types'
import { speak } from '@/lib/voice'
import { useSettings } from '@/store/settings'
import { radius, space, useTheme } from '@/theme'

import { Markdown } from './Markdown'
import { RemoteImage } from './RemoteImage'
import { ToolCard } from './ToolCard'

function Reasoning({ text, live }: { text: string; live: boolean }) {
  const { c } = useTheme()
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <View style={[styles.reasoning, { borderLeftColor: c.borderStrong }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t('Reasoning')}
        onPress={() => setOpen(!open)}
        hitSlop={8}
        style={styles.reasonHead}
      >
        <Brain size={14} color={c.textMuted} />
        <Text variant="small" tone="muted" weight="medium">
          {live ? t('Thinking…') : t('Thought process')}
        </Text>
        {open ? <ChevronDown size={14} color={c.textFaint} /> : <ChevronRight size={14} color={c.textFaint} />}
      </Pressable>
      {open ? (
        <Text variant="small" tone="muted" selectable>
          {text}
        </Text>
      ) : live ? (
        <Text variant="small" tone="faint" numberOfLines={2}>
          {text.slice(-240)}
        </Text>
      ) : null}
    </View>
  )
}

interface Props {
  message: ChatMessage
  streaming: boolean
  onEdit?: (m: ChatMessage) => void
  onReact?: (m: ChatMessage, emoji: string) => void
}

export const MessageItem = memo(function MessageItem({ message, streaming, onEdit, onReact }: Props) {
  const { c } = useTheme()
  const t = useT()
  const showReasoning = useSettings((s) => s.showReasoning)

  if (message.role === 'system') {
    const tone = message.tone ?? 'info'
    const Icon = tone === 'error' ? XCircle : tone === 'warn' ? AlertTriangle : Info
    const color = tone === 'error' ? c.danger : tone === 'warn' ? c.warn : c.textMuted
    const bg = tone === 'error' ? c.dangerSoft : tone === 'warn' ? c.warnSoft : c.surfaceAlt
    return (
      <View style={[styles.system, { backgroundColor: bg }]} accessibilityRole={tone === 'error' ? 'alert' : undefined}>
        <Icon size={16} color={color} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, gap: 2 }}>
          {message.label ? <Badge label={message.label} /> : null}
          <Markdown text={textOf(message)} muted={tone === 'info'} />
        </View>
      </View>
    )
  }

  if (message.role === 'user') {
    const text = textOf(message)
    return (
      <View style={styles.userWrap}>
        <Pressable
          accessibilityLabel={t('Your message: {text}', { text })}
          onLongPress={() => {
            if (onEdit && message.rowId != null) onEdit(message)
            else {
              void Clipboard.setStringAsync(text)
              toast(t('Copied'), 'success')
            }
          }}
          delayLongPress={350}
          style={[styles.user, { backgroundColor: c.userBubble, borderColor: c.border, opacity: message.pending === 'sending' ? 0.7 : 1 }]}
        >
          {message.label ? <Badge label={message.label} tone="accent" /> : null}
          {message.images?.length ? (
            <View style={styles.attachRow}>
              {message.images.map((img) =>
                img.startsWith('file:') || img.startsWith('data:') || img.startsWith('blob:') || img.startsWith('/') ? (
                  <RemoteImage key={img} src={img} size={96} />
                ) : (
                  <View key={img} style={[styles.fileChip, { backgroundColor: c.surfaceAlt }]}>
                    <ImageIcon size={14} color={c.textMuted} />
                    <Text variant="caption" numberOfLines={1}>
                      {img.split('/').pop()}
                    </Text>
                  </View>
                ),
              )}
            </View>
          ) : null}
          {message.files?.length ? (
            <View style={styles.attachRow}>
              {message.files.map((f) => (
                <View key={f} style={[styles.fileChip, { backgroundColor: c.surfaceAlt }]}>
                  <FileText size={14} color={c.textMuted} />
                  <Text variant="caption" numberOfLines={1}>
                    {f.split('/').pop()}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {text ? (
            <Text variant="body" selectable>
              {text}
            </Text>
          ) : null}
        </Pressable>
        {message.pending === 'queued' ? (
          <View style={styles.meta}>
            <Clock size={12} color={c.textFaint} />
            <Text variant="caption" tone="faint">
              {t('Queued — runs after the current turn')}
            </Text>
          </View>
        ) : null}
        {message.error ? (
          <Text variant="caption" tone="danger" style={{ alignSelf: 'flex-end' }}>
            {message.error}
          </Text>
        ) : null}
      </View>
    )
  }

  const text = textOf(message)
  const lastReasoningIdx = message.parts.map((p) => p.kind).lastIndexOf('reasoning')
  return (
    <View style={styles.assistant}>
      {message.label ? <Badge label={message.label} tone="info" /> : null}
      {message.parts.map((part, i) => {
        if (part.kind === 'reasoning') {
          if (!showReasoning || !part.text.trim()) return null
          const live = streaming && i === lastReasoningIdx && !message.parts.slice(i + 1).some((p) => p.kind === 'text')
          return <Reasoning key={i} text={part.text} live={live} />
        }
        if (part.kind === 'tool') return <ToolCard key={part.id} part={part} />
        if (!part.text) return null
        return <Markdown key={i} text={part.text} />
      })}
      {message.images?.length ? (
        <View style={styles.attachRow}>
          {message.images.map((img) => (
            <RemoteImage key={img.slice(0, 64)} src={img} size={220} />
          ))}
        </View>
      ) : null}
      {streaming && !text && !message.parts.length ? <View style={[styles.cursor, { backgroundColor: c.accent }]} /> : null}
      {message.error ? (
        <View style={[styles.system, { backgroundColor: c.dangerSoft }]}>
          <XCircle size={16} color={c.danger} />
          <Text variant="small" tone="danger" style={{ flex: 1 }} selectable>
            {message.error}
          </Text>
        </View>
      ) : null}
      {!streaming && text ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Copy reply')}
            hitSlop={10}
            onPress={async () => {
              await Clipboard.setStringAsync(text)
              toast(t('Copied'), 'success')
            }}
            style={styles.action}
          >
            <Copy size={15} color={c.textFaint} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Read aloud')}
            hitSlop={10}
            onPress={() => speak(text)}
            style={styles.action}
          >
            <Volume2 size={15} color={c.textFaint} />
          </Pressable>
          {onReact && !message.label ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Good reply')}
                hitSlop={10}
                onPress={() => onReact(message, '👍')}
                style={styles.action}
              >
                <ThumbsUp size={15} color={message.reaction === '👍' ? c.accentText : c.textFaint} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Bad reply')}
                hitSlop={10}
                onPress={() => onReact(message, '👎')}
                style={styles.action}
              >
                <ThumbsDown size={15} color={message.reaction === '👎' ? c.danger : c.textFaint} />
              </Pressable>
            </>
          ) : null}
          {message.interim ? (
            <Text variant="caption" tone="faint">
              {t('interim')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  userWrap: { alignItems: 'flex-end', gap: 4, paddingLeft: 48 },
  user: {
    borderRadius: radius.lg,
    borderBottomRightRadius: 6,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    gap: space.xs,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
  },
  assistant: { gap: space.sm },
  system: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md },
  reasoning: { borderLeftWidth: 2, paddingLeft: space.md, gap: 4 },
  reasonHead: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 },
  cursor: { width: 8, height: 16, borderRadius: 2, opacity: 0.8 },
  actions: { flexDirection: 'row', gap: space.xs, alignItems: 'center' },
  action: { width: 36, height: 32, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  attachRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    maxWidth: 200,
  },
})
