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
  RotateCcw,
  Share2,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  CheckCircle2,
  XCircle,
} from '@/components/icons'
import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, Easing, Platform, Pressable, Share, StyleSheet, View } from 'react-native'

import { Badge, Text, toast } from '@/components/ui'
import { useT } from '@/i18n'
import { haptic } from '@/lib/haptics'
import { hhmm } from '@/lib/format'
import { textOf, type ChatMessage, type Part, type ToolPart } from '@/lib/chat/types'
import { speak } from '@/lib/voice'
import { useSettings } from '@/store/settings'
import { motion, radius, space, useTheme } from '@/theme'

import { Markdown } from './Markdown'
import { RemoteImage } from './RemoteImage'
import { ToolCard, ToolGroup } from './ToolCard'

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
        hitSlop={10}
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

function formatElapsed(ms: number) {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

/** Long pasted prompts (logs, files) fold to a dozen lines so the reply stays in view. */
function UserText({ text }: { text: string }) {
  const t = useT()
  const long = text.length > 700 || text.split('\n').length > 14
  const [open, setOpen] = useState(false)
  return (
    <>
      <Text variant="body" selectable numberOfLines={long && !open ? 12 : undefined}>
        {text}
      </Text>
      {long ? (
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setOpen(!open)}>
          <Text variant="small" weight="medium" tone="accent">
            {open ? t('Show less') : t('Show more')}
          </Text>
        </Pressable>
      ) : null}
    </>
  )
}

/** Three dots breathing in turn while the agent has not produced anything yet. */
function TypingDots({ color }: { color: string }) {
  const t = useT()
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' }),
    )
    loop.start()
    return () => loop.stop()
  }, [anim])
  return (
    <View style={styles.dots} accessibilityLabel={t('Thinking…')} accessibilityLiveRegion="polite">
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: color,
              opacity: anim.interpolate({
                inputRange: [0, (i + 0.5) / 4, (i + 1.5) / 4, 1],
                outputRange: [0.25, 1, 0.25, 0.25],
                extrapolate: 'clamp',
              }),
            },
          ]}
        />
      ))}
    </View>
  )
}

/** Backend notices often start with their own ⚠️/ℹ️; the row already shows an icon. */
function stripLeadingEmoji(text: string) {
  return text.replace(/^\s*(?:\p{Extended_Pictographic}\uFE0F?\s*)+/u, '')
}

interface Props {
  message: ChatMessage
  streaming: boolean
  onEdit?: (m: ChatMessage) => void
  onReact?: (m: ChatMessage, emoji: string) => void
  /** Only on the latest reply, when the agent is idle. */
  onRetry?: () => void
  /** The current in-chat search hit. */
  highlighted?: boolean
}

/** Messages that appear while you watch ease in; history scrolled into view does not. */
const FRESH_MS = 1500

/** Fades and lifts its content in once; transform and opacity only, so the list layout never moves. */
function Appear({ children }: { children: ReactNode }) {
  const [anim] = useState(() => new Animated.Value(0))
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: motion.base,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start()
  }, [anim])
  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
      {children}
    </Animated.View>
  )
}

export const MessageItem = memo(function MessageItem(props: Props) {
  const { highlighted, message } = props
  const { c } = useTheme()
  const [fresh] = useState(() => Date.now() - message.at < FRESH_MS)
  const body = <MessageBody {...props} />
  const framed = highlighted ? <View style={[styles.hit, { borderColor: c.accent, backgroundColor: c.accentSoft }]}>{body}</View> : body
  return fresh ? <Appear>{framed}</Appear> : framed
})

type Segment = { kind: 'part'; part: Exclude<Part, ToolPart>; index: number } | { kind: 'tools'; parts: ToolPart[] }

/** Consecutive tool calls become one segment, so they render as a single grouped surface. */
function segmentsOf(parts: Part[]): Segment[] {
  const out: Segment[] = []
  parts.forEach((part, index) => {
    if (part.kind !== 'tool') return out.push({ kind: 'part', part, index })
    const last = out[out.length - 1]
    if (last?.kind === 'tools') last.parts.push(part)
    else out.push({ kind: 'tools', parts: [part] })
  })
  return out
}

function MessageBody({ message, streaming, onEdit, onReact, onRetry }: Props) {
  const { c } = useTheme()
  const t = useT()
  const showReasoning = useSettings((s) => s.showReasoning)

  if (message.role === 'system') {
    const tone = message.tone ?? 'info'
    const Icon = tone === 'error' ? XCircle : tone === 'warn' ? AlertTriangle : tone === 'success' ? CheckCircle2 : Info
    const color = tone === 'error' ? c.danger : tone === 'warn' ? c.warn : tone === 'success' ? c.success : c.textMuted
    return (
      <View style={[styles.system, { borderColor: c.border }]} accessibilityRole={tone === 'error' ? 'alert' : undefined}>
        <Icon size={15} color={color} strokeWidth={1.75} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, gap: 2 }}>
          {message.label ? <Badge label={message.label} /> : null}
          <Markdown text={stripLeadingEmoji(textOf(message))} muted small />
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
            haptic('light')
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
          {text ? <UserText text={text} /> : null}
        </Pressable>
        {message.agentReactions?.length ? (
          <Text variant="small" accessibilityLabel={t('Hermes reacted {emoji}', { emoji: message.agentReactions.join(' ') })}>
            {message.agentReactions.join(' ')}
          </Text>
        ) : null}
        {message.pending === 'queued' || message.error ? (
          <View style={styles.meta}>
            {message.pending === 'queued' ? (
              <>
                <Clock size={12} color={c.textFaint} />
                <Text variant="caption" tone="faint">
                  {t('Queued — runs after the current turn')}
                </Text>
              </>
            ) : null}
            {message.error ? (
              <Text variant="caption" tone="danger">
                {message.error}
              </Text>
            ) : null}
            <Text variant="caption" tone="faint" style={{ marginLeft: 'auto' }}>
              {hhmm(message.at)}
            </Text>
          </View>
        ) : (
          <Text variant="caption" tone="faint" style={{ alignSelf: 'flex-end' }}>
            {hhmm(message.at)}
          </Text>
        )}
      </View>
    )
  }

  const text = textOf(message)
  const lastReasoningIdx = message.parts.map((p) => p.kind).lastIndexOf('reasoning')
  return (
    <View style={styles.assistant}>
      {message.label ? <Badge label={message.label} tone="info" /> : null}
      {segmentsOf(message.parts).map((seg) => {
        if (seg.kind === 'tools') {
          return seg.parts.length === 1 ? (
            <ToolCard key={seg.parts[0].id} part={seg.parts[0]} />
          ) : (
            <ToolGroup key={seg.parts[0].id} parts={seg.parts} />
          )
        }
        const { part, index: i } = seg
        if (part.kind === 'reasoning') {
          if (!showReasoning || !part.text.trim()) return null
          const live = streaming && i === lastReasoningIdx && !message.parts.slice(i + 1).some((p) => p.kind === 'text')
          return <Reasoning key={i} text={part.text} live={live} />
        }
        if (!part.text) return null
        return <Markdown key={i} text={part.text} live={streaming && i === message.parts.length - 1} />
      })}
      {message.images?.length ? (
        <View style={styles.attachRow}>
          {message.images.map((img) => (
            <RemoteImage key={img.slice(0, 64)} src={img} size={220} />
          ))}
        </View>
      ) : null}
      {streaming && !text && !message.parts.length ? <TypingDots color={c.textMuted} /> : null}
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
          {onRetry ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Regenerate reply')}
              hitSlop={10}
              onPress={onRetry}
              style={styles.action}
            >
              <RotateCcw size={15} color={c.textFaint} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Share reply')}
            hitSlop={10}
            onPress={() => Share.share({ message: text }).catch(() => {})}
            style={styles.action}
          >
            <Share2 size={15} color={c.textFaint} />
          </Pressable>
          {message.interim ? (
            <Text variant="caption" tone="faint">
              {t('interim')}
            </Text>
          ) : null}
          <View style={styles.metaRight}>
            <Text variant="caption" tone="faint">
              {hhmm(message.at)}
            </Text>
            {message.elapsedMs && message.elapsedMs >= 2000 ? (
              <Text variant="caption" tone="faint">
                {t('Worked for {time}', { time: formatElapsed(message.elapsedMs) })}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  hit: { borderWidth: 1, borderRadius: radius.md, margin: -space.sm, padding: space.sm - 1 },
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
  system: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  reasoning: { borderLeftWidth: 2, paddingLeft: space.md, gap: 4 },
  reasonHead: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 },
  dots: { flexDirection: 'row', gap: 5, paddingVertical: space.sm },
  dot: { width: 7, height: 7, borderRadius: 4 },
  actions: { flexDirection: 'row', gap: space.xs, alignItems: 'center' },
  action: { width: 36, height: 32, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaRight: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: space.sm },
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
