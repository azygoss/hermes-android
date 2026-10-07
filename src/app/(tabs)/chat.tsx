import { router, useLocalSearchParams } from 'expo-router'
import {
  ArrowUpRight,
  Brain,
  ChevronDown,
  ChevronUp,
  EllipsisVertical,
  History,
  PanelLeft,
  PenSquare,
  Search,
  WifiOff,
  X,
} from '@/components/icons'
import type { LucideIcon } from '@/components/icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import ReanimatedDrawerLayout, {
  DrawerKeyboardDismissMode,
  DrawerPosition,
  DrawerType,
  type DrawerLayoutMethods,
} from 'react-native-gesture-handler/ReanimatedDrawerLayout'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useShallow } from 'zustand/react/shallow'

import { Composer } from '@/components/chat/Composer'
import { ChatDrawer } from '@/components/chat/ChatDrawer'
import { ConnectionCard } from '@/components/chat/ConnectionCard'
import { ModelPicker } from '@/components/chat/ModelPicker'
import { ReasoningSheet } from '@/components/chat/ReasoningSheet'
import { RequestCard } from '@/components/chat/RequestCard'
import { SessionMenu } from '@/components/chat/SessionMenu'
import { BusyLine, SubagentChip, TodoPanel } from '@/components/chat/StatusStrip'
import { Transcript } from '@/components/chat/Transcript'
import { HermesMark } from '@/components/HermesMark'
import { Button, IconButton, Sheet, Text, toast, toastError } from '@/components/ui'
import { useT } from '@/i18n'
import type { ChatMessage, ChatSession, PendingAttachment } from '@/lib/chat/types'
import { textOf } from '@/lib/chat/types'
import { relativeTime } from '@/lib/format'
import { useRest, useRpc } from '@/lib/hooks'
import { rpc, useProfile, useRuntime } from '@/lib/hermes'
import {
  addSystemMessage,
  attachFile,
  attachImage,
  attachPdf,
  generateImage,
  interrupt,
  newChat,
  openStored,
  removeAttachment,
  runSlash,
  send,
  setActive,
  setPrefill,
  useChat,
} from '@/store/chat'
import { useConnections } from '@/store/connections'
import { centered, font, radius, space, useTheme } from '@/theme'

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
  const { c } = useTheme()
  const ready = useRuntime((s) => s.state === 'open')
  const profile = useProfile()
  const host = useConnections((s) => s.connections.find((x) => x.id === s.activeId)?.name)
  const recent = useRpc(['session.most_recent', profile], 'session.most_recent', { profile })
  const suggestions = [
    t('What can you do?'),
    t('Summarise what we worked on yesterday'),
    t('Check the disk usage on the server'),
    t('Schedule a daily news digest at 9am'),
  ]
  const last = recent.data?.session_id ? recent.data : null
  return (
    <ScrollView contentContainerStyle={[styles.empty, centered]} keyboardShouldPersistTaps="handled">
      <View style={{ gap: space.sm }}>
        <HermesMark size={34} />
        <Text variant="h2" style={{ marginTop: space.sm }}>
          {t('What should Hermes work on?')}
        </Text>
        <Text tone="muted">
          {host
            ? t('Runs on {host} with its own tools, memory and skills. Type / for commands, @ for files.', { host })
            : t('Hermes runs on your machine with its tools, memory and skills. Ask anything, or type / for commands.')}
        </Text>
      </View>
      {last ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Continue: {title}', { title: last.title || t('last chat') })}
          onPress={() => openStored(last.session_id!).catch(toastError)}
          style={({ pressed }) => [styles.resume, { borderColor: c.border, backgroundColor: pressed ? c.surfaceAlt : c.surface }]}
        >
          <History size={18} color={c.textMuted} strokeWidth={1.75} />
          <View style={{ flex: 1 }}>
            <Text variant="caption" tone="faint">
              {t('Pick up where you left off')}
            </Text>
            <Text weight="medium" numberOfLines={1}>
              {last.title || t('last chat')}
            </Text>
          </View>
          {last.started_at ? (
            <Text variant="caption" tone="faint">
              {relativeTime(last.started_at)}
            </Text>
          ) : null}
        </Pressable>
      ) : null}
      <View>
        {suggestions.map((s, i) => (
          <Pressable
            key={s}
            accessibilityRole="button"
            disabled={!ready}
            onPress={() => onPick(s)}
            style={({ pressed }) => [
              styles.suggestion,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
              { opacity: ready ? (pressed ? 0.6 : 1) : 0.4 },
            ]}
          >
            <Text tone="muted" style={{ flex: 1 }}>
              {s}
            </Text>
            <ArrowUpRight size={16} color={c.textFaint} strokeWidth={1.75} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  )
}

/** Session fields the screen chrome shows; streamed tokens change none of them. */
function useActive<T>(pick: (s: ChatSession) => T): T | undefined {
  return useChat((s) => {
    const session = s.activeId ? s.sessions[s.activeId] : undefined
    return session ? pick(session) : undefined
  })
}

export default function ChatScreen() {
  const t = useT()
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ stored?: string; new?: string }>()
  const activeId = useChat((s) => s.activeId)
  // Primitive selectors only: the screen must not re-render for every streamed token.
  const live = useChat((s) => !!(s.activeId && s.sessions[s.activeId]))
  const title = useActive((s) => s.title)
  const busy = !!useActive((s) => s.busy)
  const hasMessages = !!useActive((s) => s.messages.length > 0)
  const blank = !!useActive((s) => s.historyLoaded && !s.messages.length && !s.loadingHistory)
  const attachments = useActive((s) => s.attachments)
  const liveModel = useActive((s) => s.info?.model)
  const liveProvider = useActive((s) => s.info?.provider)
  const effort = useActive((s) => s.info?.reasoning_effort)
  const cwd = useActive((s) => s.info?.cwd)
  const ctxPct = useActive((s) => s.usage?.context_percent) ?? null
  const myRequests = useChat(useShallow((s) => s.requests.filter((r) => r.sessionId === s.activeId)))
  const otherRequests = useChat(useShallow((s) => s.requests.filter((r) => r.sessionId !== s.activeId)))
  const myConnections = useChat(useShallow((s) => Object.values(s.connections).filter((pc) => pc.sessionId === s.activeId)))
  const prefill = useChat((s) =>
    s.composerPrefill && (s.composerPrefill.runtimeId || null) === (s.activeId || null) ? s.composerPrefill.text : null,
  )
  const opening = useChat((s) => s.opening)
  const connState = useRuntime((s) => s.state)
  const [menuOpen, setMenuOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const [editing, setEditing] = useState<ChatMessage | null>(null)
  const { width } = useWindowDimensions()
  const drawerRef = useRef<DrawerLayoutMethods>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Keep the drawer's content mounted after the first open so later swipes show it at once.
  const drawerMounted = useRef(false)
  if (drawerOpen) drawerMounted.current = true
  const openDrawer = useCallback(() => {
    drawerMounted.current = true
    setDrawerOpen(true)
    drawerRef.current?.openDrawer()
  }, [])
  const closeDrawer = useCallback(() => drawerRef.current?.closeDrawer(), [])
  useEffect(() => {
    if (!drawerOpen) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => (closeDrawer(), true))
    return () => sub.remove()
  }, [drawerOpen, closeDrawer])

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

  // Attach+send in one gesture fired this twice and created two chats; share the in-flight one.
  const creating = useRef<Promise<string> | null>(null)
  const ensureSession = useCallback(() => {
    const current = useChat.getState().activeId
    if (current) return Promise.resolve(current)
    creating.current ??= newChat().finally(() => {
      creating.current = null
    })
    return creating.current
  }, [])

  // In-chat search: the transcript finds the matches, the header steps through them.
  const [searching, setSearching] = useState(false)
  const [needle, setNeedle] = useState('')
  const [hitIndex, setHitIndex] = useState(0)
  const [hitCount, setHitCount] = useState(0)
  const query = searching ? needle.trim().toLowerCase() : ''
  useEffect(() => setHitIndex(0), [query])
  const stepHit = (d: number) => hitCount && setHitIndex((h) => (((h + d) % hitCount) + hitCount) % hitCount)
  const closeSearch = () => {
    setSearching(false)
    setNeedle('')
  }
  useEffect(closeSearch, [activeId])
  // An edit draft truncated the new chat at a foreign row id after a chat switch; drop it.
  const storedId = useActive((s) => s.storedId)
  const [editStored, setEditStored] = useState(storedId)
  if (editStored !== storedId) {
    setEditStored(storedId)
    setEditing(null)
  }
  const onEdit = useCallback((m: ChatMessage) => {
    const sid = useChat.getState().activeId
    if (!sid) return
    setEditing(m)
    setPrefill(sid, textOf(m))
  }, [])

  async function handleSend(text: string, mode: 'auto' | 'steer' | 'redirect') {
    const trimmed = text.trim()
    if (trimmed.startsWith('!') && trimmed.length > 1) {
      const sid = await ensureSession()
      const res = await rpc().request('shell.exec', { command: trimmed.slice(1).trim() }, { timeoutMs: 120_000 })
      const out = [res.stdout, res.stderr].filter(Boolean).join('\n').trim()
      addSystemMessage(
        sid,
        `\`$ ${trimmed.slice(1).trim()}\` → ${t('exit {code}', { code: res.code })}\n\n\`\`\`\n${out || ' '}\n\`\`\``,
        res.code === 0 ? 'info' : 'warn',
        'shell',
      )
      return true
    }
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

  // Stable props so the memoised Composer skips the re-render on every streamed token.
  const sendRef = useRef(handleSend)
  sendRef.current = handleSend
  const onSend = useCallback((text: string, mode: 'auto' | 'steer' | 'redirect') => sendRef.current(text, mode), [])
  const onPrefillConsumed = useCallback(() => setPrefill(useChat.getState().activeId ?? '', null), [])
  const onCancelEdit = useCallback(() => setEditing(null), [])
  const onStop = useCallback(() => {
    const sid = useChat.getState().activeId
    if (sid) interrupt(sid).catch(toastError)
  }, [])
  const onAttachImage = useCallback(
    async (b64: string, name: string, uri: string) => attachImage(await ensureSession(), b64, name, uri),
    [ensureSession],
  )
  const onAttachFile = useCallback(
    async (dataUrl: string, name: string) => attachFile(await ensureSession(), dataUrl, name),
    [ensureSession],
  )
  const onAttachPdf = useCallback(async (b64: string, name: string) => attachPdf(await ensureSession(), b64, name), [ensureSession])
  const onGenerateImage = useCallback(async (prompt: string) => generateImage(await ensureSession(), prompt), [ensureSession])
  const onRemoveAttachment = useCallback((key: string) => {
    const sid = useChat.getState().activeId
    if (sid) removeAttachment(sid, key)
  }, [])
  const pills = useMemo(
    () => <ComposerPills onModel={() => setModelOpen(true)} onReasoning={() => setReasoningOpen(true)} onMenu={() => setMenuOpen(true)} />,
    [],
  )

  const defaultModel = useRest<{ model?: string; provider?: string }>(['model-info'], '/api/model/info', undefined, { enabled: !live })
  const model = live ? liveModel : defaultModel.data?.model
  const provider = live ? liveProvider : defaultModel.data?.provider

  return (
    <ReanimatedDrawerLayout
      ref={drawerRef}
      drawerWidth={Math.min(width * 0.84, 340)}
      drawerPosition={DrawerPosition.LEFT}
      drawerType={DrawerType.FRONT}
      edgeWidth={24}
      overlayColor={c.overlay}
      keyboardDismissMode={DrawerKeyboardDismissMode.ON_DRAG}
      onDrawerOpen={() => setDrawerOpen(true)}
      onDrawerClose={() => setDrawerOpen(false)}
      renderNavigationView={() => (drawerOpen || drawerMounted.current ? <ChatDrawer onClose={closeDrawer} /> : null)}
    >
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
        {searching ? (
          <View style={[styles.header, { borderBottomColor: c.border }]}>
            <IconButton icon={X} label={t('Close search')} onPress={closeSearch} />
            <TextInput
              value={needle}
              onChangeText={setNeedle}
              autoFocus
              placeholder={t('Search this chat')}
              placeholderTextColor={c.textFaint}
              returnKeyType="search"
              onSubmitEditing={() => stepHit(1)}
              accessibilityLabel={t('Search this chat')}
              style={[styles.searchInput, { color: c.text, fontFamily: font.regular }]}
            />
            <Text variant="small" tone="muted" style={{ minWidth: 40, textAlign: 'center' }} accessibilityLiveRegion="polite">
              {needle.trim() ? (hitCount ? `${(hitIndex % hitCount) + 1}/${hitCount}` : '0') : ''}
            </Text>
            <IconButton icon={ChevronUp} label={t('Older match')} onPress={() => stepHit(1)} disabled={!hitCount} />
            <IconButton icon={ChevronDown} label={t('Newer match')} onPress={() => stepHit(-1)} disabled={!hitCount} />
          </View>
        ) : (
          <View style={[styles.header, { borderBottomColor: c.border }]}>
            <IconButton icon={PanelLeft} label={t('Chats, profiles and backends')} onPress={openDrawer} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Chat options')}
              onPress={() => live && setMenuOpen(true)}
              style={{ flex: 1, minHeight: 48, justifyContent: 'center' }}
            >
              <Text variant="title" numberOfLines={1}>
                {title || t('New chat')}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View
                  style={[styles.dot, { backgroundColor: connState === 'open' ? c.success : connState === 'closed' ? c.danger : c.warn }]}
                />
                <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {[model, ctxPct != null ? t('{pct}% context', { pct: ctxPct }) : null, cwd ? String(cwd).split('/').pop() : null]
                    .filter(Boolean)
                    .join(' · ') || t('Hermes Agent')}
                </Text>
              </View>
            </Pressable>
            {hasMessages ? <IconButton icon={Search} label={t('Search this chat')} onPress={() => setSearching(true)} /> : null}
            <IconButton icon={PenSquare} label={t('New chat')} onPress={() => setActive(null)} />
            <IconButton
              icon={EllipsisVertical}
              label={t('Chat options')}
              onPress={() => (live ? setMenuOpen(true) : toast(t('Start a chat first.'), 'info'))}
            />
          </View>
        )}

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

        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          {opening && !live ? (
            <View style={styles.loading}>
              <ActivityIndicator color={c.accent} />
            </View>
          ) : !live || !activeId || blank ? (
            <EmptyChat onPick={(text) => handleSend(text, 'auto').catch(toastError)} />
          ) : (
            <Transcript runtimeId={activeId} query={query} hitIndex={hitIndex} onHitCount={setHitCount} onEdit={onEdit} />
          )}

          {myConnections.map((pc) => (
            <View key={pc.op.op_id} style={{ paddingHorizontal: space.md, paddingBottom: space.sm }}>
              <ConnectionCard pc={pc} />
            </View>
          ))}
          {myRequests.length ? (
            <View style={{ paddingHorizontal: space.md, gap: space.sm, paddingBottom: space.sm }}>
              {myRequests.map((r) => (
                <RequestCard key={r.id} req={r} />
              ))}
            </View>
          ) : null}

          {activeId && live ? <LiveStatus runtimeId={activeId} /> : null}

          <View style={{ paddingBottom: insets.bottom > 0 ? 0 : space.sm }}>
            <Composer
              sessionId={activeId}
              busy={busy}
              attachments={attachments ?? NO_ATTACHMENTS}
              editing={!!editing}
              prefill={prefill}
              onPrefillConsumed={onPrefillConsumed}
              onCancelEdit={onCancelEdit}
              onSend={onSend}
              onStop={onStop}
              ensureSession={ensureSession}
              onAttachImage={onAttachImage}
              onAttachFile={onAttachFile}
              onAttachPdf={onAttachPdf}
              onGenerateImage={onGenerateImage}
              onRemoveAttachment={onRemoveAttachment}
              pills={pills}
            />
          </View>
        </KeyboardAvoidingView>

        {activeId && live ? (
          <MenuHost
            runtimeId={activeId}
            visible={menuOpen}
            onClose={() => setMenuOpen(false)}
            onPickModel={() => setModelOpen(true)}
            onPickReasoning={() => setReasoningOpen(true)}
          />
        ) : null}
        <ModelPicker
          visible={modelOpen}
          onClose={() => setModelOpen(false)}
          sessionId={activeId}
          currentModel={model as string | undefined}
          currentProvider={provider as string | undefined}
        />
        <ReasoningSheet
          visible={reasoningOpen}
          onClose={() => setReasoningOpen(false)}
          sessionId={activeId}
          model={model as string | undefined}
          provider={provider as string | undefined}
          effort={effort}
          onPick={async (level) => {
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
        />
      </View>
    </ReanimatedDrawerLayout>
  )
}

/** Task list and the "working" line; both change during a turn, so they subscribe on their own. */
function LiveStatus({ runtimeId }: { runtimeId: string }) {
  const todos = useChat((s) => s.sessions[runtimeId]?.todos)
  const busy = useChat((s) => !!s.sessions[runtimeId]?.busy)
  const status = useChat((s) => s.sessions[runtimeId]?.status ?? null)
  const since = useChat((s) => s.sessions[runtimeId]?.turnStartedAt ?? null)
  return (
    <>
      {todos ? <TodoPanel todos={todos} /> : null}
      {busy ? <BusyLine status={status} since={since} /> : null}
    </>
  )
}

/** The chat menu reads the whole session, but only while it is open. */
function MenuHost({ runtimeId, visible, ...rest }: { runtimeId: string } & Omit<Parameters<typeof SessionMenu>[0], 'session'>) {
  const current = useChat((s) => (visible ? s.sessions[runtimeId] : undefined))
  const last = useRef<ChatSession | undefined>(undefined)
  if (current) last.current = current
  const session = current ?? (last.current?.runtimeId === runtimeId ? last.current : undefined)
  return session ? <SessionMenu visible={visible} session={session} {...rest} /> : null
}

const NO_ATTACHMENTS: PendingAttachment[] = []

/** Model, reasoning and subagent pills; reads the store itself so the composer need not re-render. */
function ComposerPills({ onModel, onReasoning, onMenu }: { onModel: () => void; onReasoning: () => void; onMenu: () => void }) {
  const t = useT()
  // Primitive selectors: streamed tokens change the session object but none of these.
  const runtimeId = useChat((s) => (s.activeId && s.sessions[s.activeId] ? s.activeId : null))
  const model = useChat((s) => (s.activeId ? s.sessions[s.activeId]?.info?.model : undefined))
  const effort = useChat((s) => (s.activeId ? s.sessions[s.activeId]?.info?.reasoning_effort : undefined))
  const yolo = useChat((s) => (s.activeId ? s.sessions[s.activeId]?.info?.yolo : undefined))
  const subagents = useChat((s) => (s.activeId ? s.sessions[s.activeId]?.subagents : undefined))
  const live = !!runtimeId
  const fallback = useRest<{ model?: string }>(['model-info'], '/api/model/info', undefined, { enabled: !live })
  return (
    <>
      <Pill label={String((live ? model : fallback.data?.model) ?? t('Model'))} onPress={onModel} />
      <Pill icon={Brain} label={String(effort || t('default'))} onPress={onReasoning} />
      {yolo ? <Pill label="YOLO" tone="danger" onPress={onMenu} /> : null}
      {runtimeId && subagents ? (
        <SubagentChip subagents={subagents} onPress={() => router.push({ pathname: '/session/agents', params: { sid: runtimeId } })} />
      ) : null}
    </>
  )
}

function Pill({ label, onPress, tone, icon: Icon }: { label: string; onPress: () => void; tone?: 'danger'; icon?: LucideIcon }) {
  const { c } = useTheme()
  const color = tone === 'danger' ? c.danger : c.textMuted
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={7}
      style={({ pressed }) => [styles.pill, { backgroundColor: pressed ? c.surfaceAlt : tone === 'danger' ? c.dangerSoft : 'transparent' }]}
    >
      {Icon ? <Icon size={14} color={color} strokeWidth={1.75} /> : null}
      <Text variant="small" weight="medium" numberOfLines={1} style={{ maxWidth: 170, color }}>
        {label}
      </Text>
      <ChevronDown size={13} color={c.textFaint} strokeWidth={1.75} />
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
  searchInput: { flex: 1, minWidth: 0, fontSize: 16, height: 48, paddingHorizontal: space.xs },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  empty: { flexGrow: 1, justifyContent: 'flex-end', gap: space.xl, paddingHorizontal: space.xl, paddingVertical: space.lg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  resume: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, paddingVertical: space.sm },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingHorizontal: 10, height: 34 },
})
