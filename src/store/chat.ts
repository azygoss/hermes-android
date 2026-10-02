import { create } from 'zustand'

import { toast } from '@/components/ui/Dialogs'
import { t } from '@/i18n'
import { foldHistory, isToolError, type SessionMessageRow } from '@/lib/chat/history'
import {
  localId,
  type ChatMessage,
  type ChatSession,
  type Part,
  type PendingAttachment,
  type Subagent,
  type Todo,
  type ToolPart,
} from '@/lib/chat/types'
import type { AnyGatewayEvent, ServerRequest } from '@/lib/gateway/client'
import type { SessionLiveInfo, SessionResumeResult, SlashExecResult, Usage } from '@/lib/gateway/contract.generated'
import { hermes, useRuntime } from '@/lib/hermes'
import { changeSignals, queryClient } from '@/lib/query'

const COLS = 60
const SOURCE = 'android'
const HISTORY_PAGE = 120

export interface PendingRequest extends ServerRequest {
  sessionId: string
  receivedAt: number
}

interface ChatState {
  sessions: Record<string, ChatSession>
  storedToRuntime: Record<string, string>
  activeId: string | null
  requests: PendingRequest[]
  composerPrefill: { runtimeId: string; text: string } | null
  opening: boolean
}

type TurnListener = (session: ChatSession, message: ChatMessage | null) => void
const turnListeners = new Set<TurnListener>()
export const onTurnComplete = (l: TurnListener) => {
  turnListeners.add(l)
  return () => void turnListeners.delete(l)
}

export const useChat = create<ChatState>(() => ({
  sessions: {},
  storedToRuntime: {},
  activeId: null,
  requests: [],
  composerPrefill: null,
  opening: false,
}))

const get = useChat.getState
const set = useChat.setState

function blankSession(runtimeId: string, storedId: string | null, info: SessionLiveInfo | null): ChatSession {
  return {
    runtimeId,
    storedId,
    title: (info?.title as string | undefined) || null,
    info,
    messages: [],
    streamingId: null,
    busy: !!info?.running,
    turnStartedAt: null,
    status: null,
    usage: (info?.usage as Usage | undefined) ?? null,
    todos: [],
    subagents: {},
    queue: [],
    attachments: [],
    historyLoaded: false,
    historyOffset: 0,
    hasMore: false,
    loadingHistory: false,
    error: null,
  }
}

function update(rid: string, fn: (s: ChatSession) => Partial<ChatSession> | ChatSession | void) {
  set((state) => {
    const s = state.sessions[rid]
    if (!s) return state
    const patch = fn(s)
    if (!patch) return state
    return { sessions: { ...state.sessions, [rid]: { ...s, ...patch } } }
  })
}

function patchMessage(s: ChatSession, id: string, fn: (m: ChatMessage) => ChatMessage): ChatMessage[] {
  return s.messages.map((m) => (m.id === id ? fn(m) : m))
}

/** Returns the session with a live assistant bubble to stream into. */
function withStreaming(s: ChatSession): [ChatSession, string] {
  if (s.streamingId && s.messages.some((m) => m.id === s.streamingId)) return [s, s.streamingId]
  const msg: ChatMessage = { id: localId('a'), role: 'assistant', parts: [], at: Date.now() }
  return [{ ...s, messages: [...s.messages, msg], streamingId: msg.id }, msg.id]
}

function appendPart(m: ChatMessage, kind: 'text' | 'reasoning', text: string): ChatMessage {
  const parts = [...m.parts]
  const last = parts[parts.length - 1]
  if (last && last.kind === kind) parts[parts.length - 1] = { ...last, text: last.text + text }
  else parts.push({ kind, text })
  return { ...m, parts }
}

function upsertTool(m: ChatMessage, id: string, fn: (p: ToolPart | null) => ToolPart): ChatMessage {
  const idx = m.parts.findIndex((p) => p.kind === 'tool' && p.id === id)
  const parts = [...m.parts]
  if (idx >= 0) parts[idx] = fn(parts[idx] as ToolPart)
  else parts.push(fn(null))
  return { ...m, parts }
}

function findToolMessage(s: ChatSession, toolId: string) {
  for (let i = s.messages.length - 1; i >= 0; i--) {
    if (s.messages[i].parts.some((p) => p.kind === 'tool' && p.id === toolId)) return s.messages[i].id
  }
  return null
}

function systemMessage(text: string, tone: ChatMessage['tone'] = 'info', label?: string): ChatMessage {
  return { id: localId('s'), role: 'system', parts: [{ kind: 'text', text }], at: Date.now(), tone, label }
}

export function addSystemMessage(rid: string, text: string, tone: ChatMessage['tone'] = 'info', label?: string) {
  update(rid, (s) => ({ messages: [...s.messages, systemMessage(text, tone, label)] }))
}

// ── streamed text batching ────────────────────────────────────────────────

const buffers = new Map<string, { text: string; reasoning: string }>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

function bufferDelta(rid: string, kind: 'text' | 'reasoning', text: string) {
  const b = buffers.get(rid) ?? { text: '', reasoning: '' }
  b[kind] += text
  buffers.set(rid, b)
  flushTimer ??= setTimeout(flushAll, 50)
}

function flushAll() {
  flushTimer = null
  for (const [rid, b] of buffers) {
    buffers.delete(rid)
    update(rid, (s0) => {
      const [s, mid] = withStreaming(s0)
      let msgs = s.messages
      if (b.reasoning) msgs = msgs.map((m) => (m.id === mid ? appendPart(m, 'reasoning', b.reasoning) : m))
      if (b.text) msgs = msgs.map((m) => (m.id === mid ? appendPart(m, 'text', b.text) : m))
      return { ...s, messages: msgs, status: b.text ? null : s.status }
    })
  }
}

function flushSession(rid: string) {
  if (!buffers.has(rid)) return
  const b = buffers.get(rid)!
  buffers.delete(rid)
  update(rid, (s0) => {
    const [s, mid] = withStreaming(s0)
    let msgs = s.messages
    if (b.reasoning) msgs = msgs.map((m) => (m.id === mid ? appendPart(m, 'reasoning', b.reasoning) : m))
    if (b.text) msgs = msgs.map((m) => (m.id === mid ? appendPart(m, 'text', b.text) : m))
    return { ...s, messages: msgs }
  })
}

// ── event reducer ─────────────────────────────────────────────────────────

function toTodos(raw: unknown[] | undefined | null): Todo[] {
  return (raw ?? []).map((x, i) => {
    const o = (x ?? {}) as Record<string, unknown>
    return {
      id: String(o.id ?? i),
      content: String(o.content ?? ''),
      status: String(o.status ?? 'pending'),
      parent: (o.parent as string) ?? null,
    }
  })
}

export function handleEvent(event: AnyGatewayEvent) {
  const signal = changeSignals[event.type]
  if (signal) {
    for (const key of signal) void queryClient.invalidateQueries({ queryKey: key })
  }
  if (event.type === 'gateway.ready') {
    useRuntime.setState({ ready: event.payload as never })
    return
  }
  if (event.type === 'skin.changed') {
    const ready = useRuntime.getState().ready
    if (ready) useRuntime.setState({ ready: { ...ready, skin: event.payload as never } })
    return
  }
  if (event.type === 'notification.show') {
    const p = event.payload
    toast(p.text, p.level === 'error' ? 'error' : p.level === 'warning' || p.level === 'warn' ? 'warn' : 'info', p.key ?? undefined)
    return
  }
  if (event.type === 'request.cancel') {
    set((st) => ({ requests: st.requests.filter((r) => r.id !== event.payload.id) }))
    return
  }

  const rid = event.session_id
  if (!rid || !get().sessions[rid]) return

  switch (event.type) {
    case 'message.start':
      update(rid, (s0) => {
        // A server-queued prompt starts now: its bubble is no longer pending.
        const firstQueued = s0.messages.findIndex((m) => m.role === 'user' && m.pending === 'queued')
        const messages = firstQueued >= 0 ? s0.messages.map((m, i) => (i === firstQueued ? { ...m, pending: null } : m)) : s0.messages
        return { messages, busy: true, turnStartedAt: Date.now(), streamingId: null, status: null, error: null }
      })
      return
    case 'message.delta':
      if (event.payload.text) bufferDelta(rid, 'text', event.payload.text)
      return
    case 'reasoning.delta':
      if (event.payload.text) bufferDelta(rid, 'reasoning', event.payload.text)
      return
    case 'reasoning.available': {
      const text = event.payload.text
      if (!text) return
      flushSession(rid)
      update(rid, (s0) => {
        const [s, mid] = withStreaming(s0)
        return {
          ...s,
          messages: patchMessage(s, mid, (m) =>
            m.parts.some((p) => p.kind === 'text') || m.parts.some((p) => p.kind === 'reasoning')
              ? m
              : { ...m, parts: [{ kind: 'reasoning', text }, ...m.parts] },
          ),
        }
      })
      return
    }
    case 'thinking.delta':
      if (event.payload.text) update(rid, () => ({ status: event.payload.text }))
      return
    case 'tool.generating':
      update(rid, () => ({ status: t('Preparing {tool}…', { tool: event.payload.name }) }))
      return
    case 'tool.start': {
      const p = event.payload
      flushSession(rid)
      update(rid, (s0) => {
        const [s, mid] = withStreaming(s0)
        return {
          ...s,
          status: null,
          messages: patchMessage(s, mid, (m) =>
            upsertTool(m, p.tool_id, (old) => ({
              ...(old ?? {}),
              kind: 'tool',
              id: p.tool_id,
              name: p.name,
              args: p.args ?? old?.args ?? null,
              context: p.context ?? old?.context ?? null,
              status: 'running',
              startedAt: Date.now(),
            })),
          ),
        }
      })
      return
    }
    case 'tool.complete': {
      const p = event.payload
      flushSession(rid)
      update(rid, (s0) => {
        let s = s0
        let mid = findToolMessage(s, p.tool_id)
        if (!mid) [s, mid] = withStreaming(s0)
        const todos = p.todos ? toTodos(p.todos) : s.todos
        return {
          ...s,
          todos,
          messages: patchMessage(s, mid, (m) =>
            upsertTool(m, p.tool_id, (old) => ({
              ...(old ?? { kind: 'tool', id: p.tool_id, name: p.name }),
              kind: 'tool',
              args: p.args ?? old?.args ?? null,
              status: isToolError(p.result) ? 'error' : 'done',
              result: p.result,
              resultText: p.result_text ?? null,
              summary: p.summary ?? null,
              duration: p.duration_s ?? null,
              diff: p.inline_diff ?? null,
            })),
          ),
        }
      })
      return
    }
    case 'message.interim':
      flushSession(rid)
      update(rid, (s) => {
        if (!s.streamingId) {
          const msg: ChatMessage = {
            id: localId('a'),
            role: 'assistant',
            parts: [{ kind: 'text', text: event.payload.text }],
            at: Date.now(),
            interim: true,
          }
          return { messages: [...s.messages, msg] }
        }
        return {
          streamingId: null,
          messages: patchMessage(s, s.streamingId, (m) => {
            const hasText = m.parts.some((p) => p.kind === 'text')
            return { ...m, interim: true, parts: hasText ? m.parts : [...m.parts, { kind: 'text', text: event.payload.text }] }
          }),
        }
      })
      return
    case 'message.complete': {
      const p = event.payload
      flushSession(rid)
      let finished: ChatMessage | null = null
      update(rid, (s0) => {
        const finalText = typeof p.text === 'string' && p.text ? p.text : (p.rendered ?? '')
        let s = s0
        let mid = s.streamingId
        if (!mid && finalText) [s, mid] = withStreaming(s0)
        const messages = mid
          ? patchMessage(s, mid, (m) => {
              let parts: Part[] = m.parts
              const hasText = parts.some((x) => x.kind === 'text' && x.text.trim())
              if (finalText && (p.response_transformed || !hasText)) {
                parts = [...parts.filter((x) => x.kind !== 'text'), { kind: 'text', text: finalText }]
              }
              if (p.reasoning && !parts.some((x) => x.kind === 'reasoning')) parts = [{ kind: 'reasoning', text: p.reasoning }, ...parts]
              if (p.status && p.status !== 'complete') {
                parts = parts.map((x) => (x.kind === 'tool' && x.status === 'running' ? { ...x, status: 'error' as const } : x))
              }
              const error =
                p.status === 'error'
                  ? p.error || p.failure_reason || t('The turn failed.')
                  : p.status === 'interrupted'
                    ? t('Interrupted')
                    : null
              finished = {
                ...m,
                parts,
                error,
                rowId: p.persisted_turn?.final_assistant_row_id ?? m.rowId,
              }
              return finished
            })
          : s.messages
        const userRow = p.persisted_turn?.user_row_id
        const withRow =
          userRow != null
            ? (() => {
                const idx = [...messages].reverse().findIndex((m) => m.role === 'user')
                if (idx < 0) return messages
                const real = messages.length - 1 - idx
                return messages.map((m, i) => (i === real && m.rowId == null ? { ...m, rowId: userRow } : m))
              })()
            : messages
        const warn = p.warning ? [systemMessage(p.warning, 'warn')] : []
        return {
          ...s,
          messages: [...withRow, ...warn],
          busy: false,
          streamingId: null,
          status: null,
          turnStartedAt: null,
          usage: (p.usage as Usage | undefined) ?? s.usage,
        }
      })
      const session = get().sessions[rid]
      if (session) for (const l of turnListeners) l(session, finished)
      return
    }
    case 'todo.updated':
      update(rid, () => ({ todos: toTodos(event.payload.todos) }))
      return
    case 'status.update': {
      const { kind, text } = event.payload
      if (!text) return
      if (kind === 'lifecycle' || kind === 'goal' || kind === 'loop' || kind === 'heartbeat') {
        addSystemMessage(rid, text, /⚠|warn|fail|error/i.test(text) ? 'warn' : 'info', kind === 'lifecycle' ? undefined : kind)
      } else update(rid, () => ({ status: text }))
      return
    }
    case 'session.usage':
      update(rid, () => ({ usage: event.payload.usage as Usage }))
      return
    case 'session.info': {
      const info = event.payload as SessionLiveInfo
      update(rid, (s) => ({
        info: { ...(s.info ?? {}), ...info },
        title: (info.title as string) || s.title,
        storedId: (info.stored_session_id as string) || s.storedId,
        busy: info.running === false && !s.streamingId ? false : s.busy,
        usage: (info.usage as Usage | undefined) ?? s.usage,
      }))
      const stored = info.stored_session_id
      if (stored) set((st) => ({ storedToRuntime: { ...st.storedToRuntime, [stored]: rid } }))
      return
    }
    case 'session.title':
      update(rid, () => ({ title: event.payload.title }))
      return
    case 'error':
      flushSession(rid)
      update(rid, (s) => ({
        busy: false,
        streamingId: null,
        status: null,
        messages: [...s.messages, systemMessage(event.payload.message, 'error')],
      }))
      return
    case 'tool.output_risk': {
      const p = event.payload as { tool_name?: string; summary?: string; findings?: unknown[] }
      addSystemMessage(rid, t('Tool output flagged as risky: {detail}', { detail: p.summary ?? p.tool_name ?? '' }), 'warn')
      return
    }
    case 'background.complete':
    case 'btw.complete': {
      const p = event.payload
      const label = event.type === 'btw.complete' ? 'btw' : 'background'
      update(rid, (s) => ({
        messages: [
          ...s.messages,
          {
            id: localId('x'),
            role: 'assistant',
            parts: [{ kind: 'text', text: p.text }],
            at: Date.now(),
            label: p.question ? `${label}: ${p.question}` : label,
          },
        ],
      }))
      return
    }
    case 'approval.cancelled': {
      const ids = new Set(event.payload.request_ids)
      set((st) => ({
        requests: st.requests.filter(
          (r) =>
            !(
              r.method === 'approval' &&
              r.sessionId === rid &&
              (ids.size === 0 || ids.has(String((r.params as { request_id?: string }).request_id)))
            ),
        ),
      }))
      return
    }
    case 'session.reclaimed':
      update(rid, () => ({ busy: false, streamingId: null, status: null }))
      void reattach(rid)
      return
    case 'moa.progress':
    case 'moa.aggregating':
    case 'moa.phase': {
      const p = event.payload as unknown as Record<string, unknown>
      const label = event.type === 'moa.progress' ? `MoA ${p.n ?? p.done ?? ''}/${p.total ?? ''}` : t('Mixture of Agents: aggregating…')
      update(rid, () => ({ status: label }))
      return
    }
    case 'subagent.spawn_requested':
    case 'subagent.start':
    case 'subagent.thinking':
    case 'subagent.tool':
    case 'subagent.progress':
    case 'subagent.complete': {
      const p = event.payload
      const key = p.subagent_id ?? `${p.task_index}/${p.goal}`
      update(rid, (s) => {
        const prev: Subagent = s.subagents[key] ?? { key, goal: p.goal, status: 'queued', updatedAt: Date.now() }
        const status =
          event.type === 'subagent.complete' ? (p.status ?? 'completed') : event.type === 'subagent.spawn_requested' ? 'queued' : 'running'
        const next: Subagent = {
          ...prev,
          ...p,
          key,
          goal: p.goal || prev.goal,
          status,
          lastTool: event.type === 'subagent.tool' ? (p.tool_name ?? prev.lastTool) : prev.lastTool,
          thinking: event.type === 'subagent.thinking' ? (p.text ?? prev.thinking) : prev.thinking,
          updatedAt: Date.now(),
        }
        return { subagents: { ...s.subagents, [key]: next } }
      })
      return
    }
    default:
      return
  }
}

// ── server → client requests ──────────────────────────────────────────────

const WINDOW_ONLY = new Set(['preview.act', 'preview.read', 'terminal.read', 'window.read', 'tour'])

export function handleServerRequest(request: ServerRequest) {
  const gw = hermes().gateway
  if (WINDOW_ONLY.has(request.method)) {
    // These drive Desktop panes the phone does not have.
    if (gw.capabilities?.declines_not_shown) gw.respondError(request.id, 4404, 'not shown')
    else gw.respond(request.id, { value: '' })
    return
  }
  const sessionId = String((request.params as { session_id?: string }).session_id ?? '')
  set((st) => ({
    requests: [...st.requests.filter((r) => r.id !== request.id), { ...request, sessionId, receivedAt: Date.now() }],
  }))
  if (request.method === 'approval') {
    const requestId = (request.params as { request_id?: string }).request_id
    if (requestId) void gw.call('approval.received', { session_id: sessionId, request_id: requestId }).catch(() => {})
  }
}

export function answerRequest(id: string, result: unknown) {
  hermes().gateway.respond(id, result)
  set((st) => ({ requests: st.requests.filter((r) => r.id !== id) }))
}

export function dropRequest(id: string) {
  set((st) => ({ requests: st.requests.filter((r) => r.id !== id) }))
}

// ── session lifecycle ─────────────────────────────────────────────────────

function adopt(rid: string, storedId: string | null, info: SessionLiveInfo | null, extra: Partial<ChatSession> = {}) {
  set((st) => ({
    sessions: {
      ...st.sessions,
      [rid]: { ...(st.sessions[rid] ?? blankSession(rid, storedId, info)), ...extra, info: info ?? st.sessions[rid]?.info ?? null },
    },
    storedToRuntime: storedId ? { ...st.storedToRuntime, [storedId]: rid } : st.storedToRuntime,
    activeId: rid,
  }))
}

export async function newChat(opts: { cwd?: string | null; model?: string; provider?: string; title?: string } = {}) {
  const h = hermes()
  set({ opening: true })
  try {
    const res = await h.gateway.request('session.create', {
      source: SOURCE,
      cols: COLS,
      profile: h.profile,
      cwd: opts.cwd ?? null,
      cwd_explicit: !!opts.cwd,
      model: opts.model ?? null,
      provider: opts.provider ?? null,
      title: opts.title ?? null,
    })
    adopt(res.session_id, res.stored_session_id, res.info, { historyLoaded: true })
    return res.session_id
  } finally {
    set({ opening: false })
  }
}

function inflightMessages(res: SessionResumeResult): Pick<ChatSession, 'messages' | 'streamingId'> {
  const inf = res.inflight
  if (!res.running || !inf?.assistant) return { messages: [], streamingId: null }
  const msg: ChatMessage = { id: localId('a'), role: 'assistant', parts: [{ kind: 'text', text: inf.assistant }], at: Date.now() }
  return { messages: [msg], streamingId: msg.id }
}

/** Open a stored session (from the list, a deep link, or after a branch). */
export async function openStored(storedId: string) {
  const h = hermes()
  const known = get().storedToRuntime[storedId]
  if (known && get().sessions[known]) {
    set({ activeId: known })
    try {
      const res = (await h.gateway.request('session.activate', {
        session_id: known,
        cols: COLS,
        omit_messages: true,
      })) as SessionResumeResult
      applyResume(known, res)
      return known
    } catch {
      // The runtime is gone (backend restart); fall through to a cold resume.
      set((st) => {
        const { [known]: _, ...rest } = st.sessions
        return { sessions: rest }
      })
    }
  }
  set({ opening: true })
  try {
    const res = await h.gateway.request('session.resume', {
      session_id: storedId,
      cols: COLS,
      source: SOURCE,
      omit_messages: true,
      profile: h.profile,
    })
    const rid = res.session_id
    const live = inflightMessages(res)
    adopt(rid, res.stored_session_id ?? storedId, res.info, {
      busy: !!res.running,
      turnStartedAt: res.turn_started_at ? res.turn_started_at * 1000 : null,
      todos: toTodos(res.todo_state?.todos),
      historyLoaded: false,
      ...live,
    })
    applyResume(rid, res)
    await loadHistory(rid)
    return rid
  } finally {
    set({ opening: false })
  }
}

function applyResume(rid: string, res: SessionResumeResult) {
  update(rid, (s) => ({
    info: res.info ? { ...(s.info ?? {}), ...res.info } : s.info,
    busy: res.running ?? s.busy,
    title: (res.info?.title as string) || s.title,
  }))
  hermes().gateway.deliverOpenRequests(res.open_requests)
}

/** Re-bind a runtime after the backend reclaimed it. */
async function reattach(rid: string) {
  const s = get().sessions[rid]
  if (!s?.storedId) return
  set((st) => {
    const { [rid]: _, ...rest } = st.sessions
    const { [s.storedId!]: __, ...map } = st.storedToRuntime
    return { sessions: rest, storedToRuntime: map }
  })
  if (get().activeId === rid || !get().activeId) await openStored(s.storedId).catch(() => {})
}

export async function loadHistory(rid: string, older = false) {
  const s = get().sessions[rid]
  if (!s?.storedId || s.loadingHistory) return
  update(rid, () => ({ loadingHistory: true }))
  try {
    const offset = older ? s.historyOffset : 0
    const res = await hermes().rest.get<{ messages: SessionMessageRow[]; pagination?: { returned?: number } }>(
      `/api/sessions/${encodeURIComponent(s.storedId)}/messages`,
      { query: { limit: HISTORY_PAGE, offset, order: 'latest', include_compacted: true } },
    )
    const rows = res.messages ?? []
    const folded = foldHistory(rows, { running: get().sessions[rid]?.busy })
    update(rid, (cur) => {
      const live = older ? [] : cur.messages.filter((m) => m.id === cur.streamingId || m.role === 'system' || m.pending)
      return {
        messages: older ? [...folded, ...cur.messages] : [...folded, ...live],
        historyLoaded: true,
        historyOffset: offset + rows.length,
        hasMore: rows.length >= HISTORY_PAGE,
        loadingHistory: false,
      }
    })
  } catch (e) {
    update(rid, () => ({ loadingHistory: false, historyLoaded: true, error: e instanceof Error ? e.message : String(e) }))
  }
}

export function setActive(rid: string | null) {
  set({ activeId: rid })
}

export function resetChat() {
  buffers.clear()
  set({ sessions: {}, storedToRuntime: {}, activeId: null, requests: [], composerPrefill: null, opening: false })
}

export async function closeRuntime(rid: string) {
  try {
    await hermes().gateway.request('session.close', { session_id: rid })
  } catch {
    // already gone
  }
  hermes().gateway.forgetSession(rid)
  set((st) => {
    const { [rid]: _, ...rest } = st.sessions
    return { sessions: rest, activeId: st.activeId === rid ? null : st.activeId }
  })
}

// ── sending ───────────────────────────────────────────────────────────────

export type SendMode = 'auto' | 'steer' | 'redirect'

function composePrompt(text: string, attachments: PendingAttachment[]) {
  const refs = attachments.filter((a) => a.refText).map((a) => a.refText as string)
  const hasImages = attachments.some((a) => a.kind === 'image' || a.kind === 'pdf')
  let body = text.trim()
  if (!body && hasImages) body = t('What do you see in this image?')
  return refs.length ? `${refs.join('\n')}\n\n${body}` : body
}

export async function send(rid: string, text: string, mode: SendMode = 'auto', opts: { display?: string; editRowId?: number | null } = {}) {
  const gw = hermes().gateway
  const s = get().sessions[rid]
  if (!s) throw new Error('Session is not open')
  const attachments = s.attachments.filter((a) => !a.uploading)
  const prompt = composePrompt(text, attachments)
  if (!prompt) return

  if (mode === 'steer' || mode === 'redirect') {
    const res = await gw.request(mode === 'steer' ? 'session.steer' : 'session.redirect', { session_id: rid, text: prompt })
    const status = (res as { status?: string }).status
    if (mode === 'steer') addSystemMessage(rid, t('Steering note sent: {text}', { text: prompt }), 'info', 'steer')
    else if (status !== 'rejected') {
      update(rid, (cur) => ({
        messages: [
          ...cur.messages,
          { id: localId('u'), role: 'user', parts: [{ kind: 'text', text: prompt }], at: Date.now(), label: 'redirect' },
        ],
      }))
    } else toast(t('The agent could not be redirected right now.'), 'warn')
    return
  }

  const user: ChatMessage = {
    id: localId('u'),
    role: 'user',
    parts: [{ kind: 'text', text: opts.display ?? text.trim() }],
    at: Date.now(),
    pending: 'sending',
    images: attachments.filter((a) => a.kind !== 'file').map((a) => a.previewUri ?? a.name),
    files: attachments.filter((a) => a.kind === 'file').map((a) => a.name),
  }
  update(rid, (cur) => {
    let messages = cur.messages
    if (opts.editRowId != null) {
      const idx = messages.findIndex((m) => m.rowId === opts.editRowId)
      if (idx >= 0) messages = messages.slice(0, idx)
    }
    return { messages: [...messages, user], attachments: [], error: null }
  })
  try {
    const res = await gw.request('prompt.submit', {
      session_id: rid,
      text: prompt,
      ...(opts.editRowId != null ? { truncate_before_row_id: opts.editRowId, confirm_truncate: true } : {}),
    })
    const status = res.status ?? 'streaming'
    update(rid, (cur) => ({
      busy: true,
      messages: patchMessage(cur, user.id, (m) => ({
        ...m,
        rowId: res.user_row_id ?? m.rowId,
        pending: status === 'queued' ? 'queued' : null,
        label: status === 'steered' ? 'steer' : status === 'redirected' ? 'redirect' : m.label,
      })),
    }))
  } catch (e) {
    update(rid, (cur) => ({
      messages: patchMessage(cur, user.id, (m) => ({ ...m, pending: null, error: e instanceof Error ? e.message : String(e) })),
      attachments,
    }))
    throw e
  }
}

export async function interrupt(rid: string) {
  await hermes().gateway.request('session.interrupt', { session_id: rid })
}

// ── attachments ───────────────────────────────────────────────────────────

export async function attachImage(rid: string, base64: string, name: string, previewUri?: string) {
  const key = localId('att')
  update(rid, (s) => ({ attachments: [...s.attachments, { key, kind: 'image', name, previewUri, uploading: true }] }))
  try {
    const res = await hermes().gateway.request(
      'image.attach_bytes',
      { session_id: rid, content_base64: base64, filename: name },
      { timeoutMs: 120_000 },
    )
    if (!res.attached) throw new Error(res.message || t('The image could not be attached.'))
    update(rid, (s) => ({ attachments: s.attachments.map((a) => (a.key === key ? { ...a, path: res.path, uploading: false } : a)) }))
  } catch (e) {
    update(rid, (s) => ({ attachments: s.attachments.filter((a) => a.key !== key) }))
    throw e
  }
}

export async function attachPdf(rid: string, base64: string, name: string) {
  const key = localId('att')
  update(rid, (s) => ({ attachments: [...s.attachments, { key, kind: 'pdf', name, uploading: true }] }))
  try {
    const res = await hermes().gateway.request(
      'pdf.attach',
      { session_id: rid, content_base64: base64, filename: name },
      {
        timeoutMs: 180_000,
      },
    )
    const r = res as { attached: boolean; pages_attached: number }
    if (!r.attached) throw new Error(t('The PDF could not be attached.'))
    update(rid, (s) => ({
      attachments: s.attachments.map((a) => (a.key === key ? { ...a, uploading: false, name: `${name} (${r.pages_attached}p)` } : a)),
    }))
  } catch (e) {
    update(rid, (s) => ({ attachments: s.attachments.filter((a) => a.key !== key) }))
    throw e
  }
}

export async function attachFile(rid: string, dataUrl: string, name: string) {
  const key = localId('att')
  update(rid, (s) => ({ attachments: [...s.attachments, { key, kind: 'file', name, uploading: true }] }))
  try {
    const res = await hermes().gateway.request('file.attach', { session_id: rid, data_url: dataUrl, name }, { timeoutMs: 180_000 })
    update(rid, (s) => ({
      attachments: s.attachments.map((a) => (a.key === key ? { ...a, uploading: false, refText: res.ref_text, path: res.path } : a)),
    }))
  } catch (e) {
    update(rid, (s) => ({ attachments: s.attachments.filter((a) => a.key !== key) }))
    throw e
  }
}

export async function removeAttachment(rid: string, key: string) {
  const a = get().sessions[rid]?.attachments.find((x) => x.key === key)
  update(rid, (s) => ({ attachments: s.attachments.filter((x) => x.key !== key) }))
  if (a?.kind === 'image' && a.path)
    await hermes()
      .gateway.request('image.detach', { session_id: rid, path: a.path })
      .catch(() => {})
}

// ── slash commands ────────────────────────────────────────────────────────

export function setPrefill(rid: string, text: string | null) {
  set({ composerPrefill: text == null ? null : { runtimeId: rid, text } })
}

/** Run "/name args" through the backend and apply its directive. Returns false if nothing ran. */
export async function runSlash(rid: string, command: string, depth = 0): Promise<void> {
  const gw = hermes().gateway
  const body = command.replace(/^\//, '').trim()
  let res: SlashExecResult
  try {
    res = await gw.request('slash.exec', { session_id: rid, command: body }, { timeoutMs: 180_000 })
  } catch (e) {
    const [name, ...rest] = body.split(/\s+/)
    res = await gw.request('command.dispatch', { session_id: rid, name, arg: rest.join(' ') || null })
  }
  await applyDirective(rid, res, depth)
}

async function applyDirective(rid: string, res: SlashExecResult, depth: number) {
  switch (res.type) {
    case 'alias':
      if (res.target && depth < 3) await runSlash(rid, `/${res.target}${res.message ? ` ${res.message}` : ''}`, depth + 1)
      return
    case 'send':
    case 'skill':
      if (res.notice) addSystemMessage(rid, res.notice, 'info')
      if (res.message) await send(rid, res.message, 'auto', { display: res.display ?? res.message })
      return
    case 'prefill':
      setPrefill(rid, res.message ?? '')
      return
    default: {
      const out = [res.warning ? `${t('Warning')}: ${res.warning}` : null, res.output ?? res.notice ?? res.message]
        .filter(Boolean)
        .join('\n\n')
      if (out) addSystemMessage(rid, out, res.warning ? 'warn' : 'info', 'command')
    }
  }
}
