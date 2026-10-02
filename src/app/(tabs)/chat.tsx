import { router, useLocalSearchParams } from 'expo-router'
import { Check, ChevronDown, EllipsisVertical, PenSquare, WifiOff } from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Composer } from '@/components/chat/Composer'
import { MessageItem } from '@/components/chat/MessageItem'
import { ModelPicker, REASONING_LEVELS } from '@/components/chat/ModelPicker'
import { RequestCard } from '@/components/chat/RequestCard'
import { SessionMenu } from '@/components/chat/SessionMenu'
import { BusyLine, SubagentChip, TodoPanel } from '@/components/chat/StatusStrip'
import { HermesMark } from '@/components/HermesMark'
import { Button, Chip, IconButton, Sheet, Text, toast, toastError } from '@/components/ui'
import { useT } from '@/i18n'
import type { ChatMessage } from '@/lib/chat/types'
import { textOf } from '@/lib/chat/types'
import { rpc, useRuntime } from '@/lib/hermes'
import {
  attachFile,
  attachImage,
  attachPdf,
  interrupt,
  loadHistory,
  newChat,
  openStored,
  removeAttachment,
  runSlash,
  send,
  setActive,
  setPrefill,
  useChat,
} from '@/store/chat'
import { radius, space, useTheme } from '@/theme'

const LOCAL_COMMANDS: Record<string, string> = {
  new: 'new',
  reset: 'new',
  clear: 'new',
  model: 'model',
  resume: 'sessions',
  sessions: 'sessions',
  stop: 'stop',
  reasoning: 'reasoning',
  usage: 'usage',
  context: 'usage',
  agents: 'agents',
  tasks: 'agents',
  rollback: 'rollback',
  goal: 'goal',
}

function ConnectionBanner() {
  const t = useT()
  const { c } = useTheme()
  const state = useRuntime((s) => s.state)
  const error = useRuntime((s) => s.error)
  const hermes = useRuntime((s) => s.hermes)
  if (state === 'open') return null
  const reconnecting = state === 'reconnecting' || state === 'connecting'
  return (
    <View
      style={[styles.banner, { backgroundColor: reconnecting ? c.warnSoft : c.dangerSoft }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      {reconnecting ? <ActivityIndicator size="small" color={c.warn} /> : <WifiOff size={16} color={c.danger} />}
      <Text variant="small" style={{ flex: 1 }} numberOfLines={3}>
        {state === 'connecting'
          ? t('Connecting to Hermes…')
          : reconnecting
            ? t('Reconnecting… {error}', { error: error ?? '' })
            : (error ?? t('Not connected'))}
      </Text>
      {!reconnecting ? (
        <Button
          label={hermes ? t('Retry') : t('Connect')}
          size="sm"
          variant="secondary"
          onPress={() => (hermes ? hermes.gateway.connect() : router.push('/connect'))}
        />
      ) : null}
    </View>
  )
}

function EmptyChat({ onPick }: { onPick: (text: string) => void }) {
  const t = useT()
  const ready = useRuntime((s) => s.state === 'open')
  const suggestions = [
    t('What can you do?'),
    t('Summarise what we worked on yesterday'),
    t('Check the disk usage on the server'),
    t('Schedule a daily news digest at 9am'),
  ]
  return (
    <View style={styles.empty}>
      <HermesMark size={64} />
      <Text variant="h2" center>
        {t('How can Hermes help?')}
      </Text>
      <Text tone="muted" center style={{ maxWidth: 300 }}>
        {t('Hermes runs on your machine with its tools, memory and skills. Ask anything, or type / for commands.')}
      </Text>
      <View style={styles.suggestions}>
        {suggestions.map((s) => (
          <Chip key={s} label={s} onPress={() => ready && onPick(s)} />
        ))}
      </View>
    </View>
  )
}

export default function ChatScreen() {
  const t = useT()
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ stored?: string; new?: string }>()
  const activeId = useChat((s) => s.activeId)
  const session = useChat((s) => (s.activeId ? s.sessions[s.activeId] : undefined))
  const requests = useChat((s) => s.requests)
  const prefill = useChat((s) => (s.composerPrefill && s.composerPrefill.runtimeId === s.activeId ? s.composerPrefill.text : null))
  const opening = useChat((s) => s.opening)
  const connState = useRuntime((s) => s.state)
  const [menuOpen, setMenuOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const [editing, setEditing] = useState<ChatMessage | null>(null)

  useEffect(() => {
    if (!params.stored || connState !== 'open') return
    openStored(params.stored).catch(toastError)
    router.setParams({ stored: undefined })
  }, [params.stored, connState])

  useEffect(() => {
    if (params.new) {
      setActive(null)
      router.setParams({ new: undefined })
    }
  }, [params.new])

  const ensureSession = useCallback(async () => {
    const current = useChat.getState().activeId
    if (current) return current
    return newChat()
  }, [])

  const data = useMemo(() => (session ? [...session.messages].reverse() : []), [session?.messages])
  const myRequests = requests.filter((r) => r.sessionId === activeId)
  const otherRequests = requests.filter((r) => r.sessionId !== activeId)

  async function handleSend(text: string, mode: 'auto' | 'steer' | 'redirect') {
    const trimmed = text.trim()
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
      const [name, ...rest] = trimmed.slice(1).split(/\s+/)
      const local = LOCAL_COMMANDS[name.toLowerCase()]
      const arg = rest.join(' ')
      if (local === 'new') {
        setActive(null)
        return true
      }
      if (local === 'model' && !arg) return (setModelOpen(true), true)
      if (local === 'reasoning' && !arg) return (setReasoningOpen(true), true)
      if (local === 'sessions' && !arg) return (router.push('/sessions'), true)
      if (local === 'stop' && activeId) return (await interrupt(activeId), true)
      if (local === 'usage' && activeId) return (router.push({ pathname: '/session/usage', params: { sid: activeId } }), true)
      if (local === 'agents' && activeId) return (router.push({ pathname: '/session/agents', params: { sid: activeId } }), true)
      if (local === 'rollback' && activeId && !arg) return (router.push({ pathname: '/session/rollback', params: { sid: activeId } }), true)
      const sid = await ensureSession()
      await runSlash(sid, trimmed)
      return true
    }
    const sid = await ensureSession()
    await send(sid, trimmed.replace(/^\/\//, '/'), mode, { editRowId: editing?.rowId ?? null })
    setEditing(null)
    return true
  }

  const info = session?.info ?? {}
  const usage = session?.usage
  const ctxPct = usage?.context_percent ?? null

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Chat options')}
          onPress={() => session && setMenuOpen(true)}
          style={{ flex: 1, minHeight: 48, justifyContent: 'center', paddingLeft: space.lg }}
        >
          <Text variant="title" numberOfLines={1}>
            {session?.title || t('New chat')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View
              style={[styles.dot, { backgroundColor: connState === 'open' ? c.success : connState === 'closed' ? c.danger : c.warn }]}
            />
            <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
              {[
                info.model,
                ctxPct != null ? t('{pct}% context', { pct: ctxPct }) : null,
                info.cwd ? String(info.cwd).split('/').pop() : null,
              ]
                .filter(Boolean)
                .join(' · ') || t('Hermes Agent')}
            </Text>
          </View>
        </Pressable>
        <IconButton icon={PenSquare} label={t('New chat')} onPress={() => setActive(null)} />
        <IconButton
          icon={EllipsisVertical}
          label={t('Chat options')}
          onPress={() => (session ? setMenuOpen(true) : toast(t('Start a chat first.'), 'info'))}
        />
      </View>

      <ConnectionBanner />

      {otherRequests.length ? (
        <Pressable
          onPress={() => {
            const r = otherRequests[0]
            const stored = Object.entries(useChat.getState().storedToRuntime).find(([, rid]) => rid === r.sessionId)?.[0]
            if (useChat.getState().sessions[r.sessionId]) setActive(r.sessionId)
            else if (stored) openStored(stored).catch(toastError)
          }}
          style={[styles.banner, { backgroundColor: c.accentSoft }]}
          accessibilityRole="button"
        >
          <Text variant="small" tone="accent" weight="semibold">
            {t('Another chat needs your input ({n})', { n: otherRequests.length })}
          </Text>
        </Pressable>
      ) : null}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {opening && !session ? (
          <View style={styles.empty}>
            <ActivityIndicator color={c.accent} />
          </View>
        ) : !session || (session.historyLoaded && !session.messages.length && !session.loadingHistory) ? (
          <EmptyChat onPick={(text) => handleSend(text, 'auto').catch(toastError)} />
        ) : (
          <FlatList
            data={data}
            inverted
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <MessageItem
                message={item}
                streaming={item.id === session.streamingId}
                onEdit={(m) => {
                  setEditing(m)
                  setPrefill(session.runtimeId, textOf(m))
                }}
              />
            )}
            contentContainerStyle={{ padding: space.lg, gap: space.lg }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onEndReached={() => session.hasMore && loadHistory(session.runtimeId, true)}
            onEndReachedThreshold={0.4}
            ListFooterComponent={session.loadingHistory ? <ActivityIndicator color={c.accent} style={{ margin: space.lg }} /> : null}
            removeClippedSubviews={Platform.OS === 'android'}
            maxToRenderPerBatch={8}
            windowSize={11}
          />
        )}

        {myRequests.length ? (
          <View style={{ paddingHorizontal: space.md, gap: space.sm, paddingBottom: space.sm }}>
            {myRequests.map((r) => (
              <RequestCard key={r.id} req={r} />
            ))}
          </View>
        ) : null}

        {session ? <TodoPanel todos={session.todos} /> : null}
        {session?.busy ? <BusyLine status={session.status} since={session.turnStartedAt} /> : null}

        <View style={{ paddingBottom: insets.bottom > 0 ? 0 : space.sm }}>
          <Composer
            sessionId={activeId}
            busy={!!session?.busy}
            attachments={session?.attachments ?? []}
            editing={!!editing}
            prefill={prefill}
            onPrefillConsumed={() => setPrefill(activeId ?? '', null)}
            onCancelEdit={() => setEditing(null)}
            onSend={handleSend}
            onStop={() => activeId && interrupt(activeId).catch(toastError)}
            ensureSession={ensureSession}
            onAttachImage={async (b64, name, uri) => attachImage(await ensureSession(), b64, name, uri)}
            onAttachFile={async (dataUrl, name) => attachFile(await ensureSession(), dataUrl, name)}
            onAttachPdf={async (b64, name) => attachPdf(await ensureSession(), b64, name)}
            onRemoveAttachment={(key) => activeId && removeAttachment(activeId, key)}
            pills={
              <>
                <Pill label={String(info.model ?? t('Model'))} onPress={() => setModelOpen(true)} />
                <Pill
                  label={t('Reasoning: {level}', { level: String(info.reasoning_effort || t('default')) })}
                  onPress={() => setReasoningOpen(true)}
                />
                {info.yolo ? <Pill label="YOLO" tone="danger" onPress={() => setMenuOpen(true)} /> : null}
                {session ? (
                  <SubagentChip
                    subagents={session.subagents}
                    onPress={() => router.push({ pathname: '/session/agents', params: { sid: session.runtimeId } })}
                  />
                ) : null}
              </>
            }
          />
        </View>
      </KeyboardAvoidingView>

      {session ? (
        <SessionMenu
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          session={session}
          onPickModel={() => setModelOpen(true)}
          onPickReasoning={() => setReasoningOpen(true)}
        />
      ) : null}
      <ModelPicker
        visible={modelOpen}
        onClose={() => setModelOpen(false)}
        sessionId={activeId}
        currentModel={info.model as string | undefined}
        currentProvider={info.provider as string | undefined}
      />
      <Sheet visible={reasoningOpen} onClose={() => setReasoningOpen(false)} title={t('Reasoning effort')}>
        <Text tone="muted" variant="small">
          {t('How hard the model thinks before answering. Higher is slower and costs more.')}
        </Text>
        <View style={{ gap: space.xs }}>
          {REASONING_LEVELS.map((level) => {
            const on = (info.reasoning_effort || '') === level
            return (
              <Pressable
                key={level}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={async () => {
                  setReasoningOpen(false)
                  try {
                    const sid = await ensureSession()
                    await rpc().request('config.set', { key: 'reasoning', value: level, session_id: sid })
                    useChat.setState((st) => ({
                      sessions: {
                        ...st.sessions,
                        [sid]: { ...st.sessions[sid], info: { ...st.sessions[sid].info, reasoning_effort: level } },
                      },
                    }))
                    toast(t('Reasoning effort: {level}', { level }), 'success')
                  } catch (e) {
                    toastError(e)
                  }
                }}
                style={[styles.option, { backgroundColor: on ? c.accentSoft : c.surfaceAlt }]}
              >
                <Text weight={on ? 'semibold' : 'regular'} style={{ flex: 1 }}>
                  {level}
                </Text>
                {on ? <Check size={18} color={c.accentText} /> : null}
              </Pressable>
            )
          })}
        </View>
      </Sheet>
    </View>
  )
}

function Pill({ label, onPress, tone }: { label: string; onPress: () => void; tone?: 'danger' }) {
  const { c } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={[
        styles.pill,
        { backgroundColor: tone === 'danger' ? c.dangerSoft : c.surfaceAlt, borderColor: tone === 'danger' ? c.danger : c.border },
      ]}
    >
      <Text
        variant="caption"
        weight="medium"
        numberOfLines={1}
        style={{ maxWidth: 180, color: tone === 'danger' ? c.danger : c.textMuted }}
      >
        {label}
      </Text>
      <ChevronDown size={12} color={tone === 'danger' ? c.danger : c.textFaint} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center', marginTop: space.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    height: 30,
  },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderRadius: radius.md, paddingHorizontal: space.lg },
})
