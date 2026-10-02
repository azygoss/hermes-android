import type { SessionLiveInfo, SubagentEventPayload, Usage } from '@/lib/gateway/contract.generated'

export interface ToolPart {
  kind: 'tool'
  id: string
  name: string
  args?: Record<string, unknown> | null
  context?: string | null
  status: 'running' | 'done' | 'error'
  result?: unknown
  resultText?: string | null
  summary?: string | null
  duration?: number | null
  diff?: string | null
  startedAt?: number
}

export type Part = { kind: 'text'; text: string } | { kind: 'reasoning'; text: string } | ToolPart

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  parts: Part[]
  at: number
  rowId?: number | null
  /** User message not yet acknowledged, or queued locally while a turn runs. */
  pending?: 'sending' | 'queued' | null
  interim?: boolean
  /** How long the turn ran, for turns finished while the app watched. */
  elapsedMs?: number
  error?: string | null
  tone?: 'info' | 'warn' | 'error' | 'success'
  /** Paths/names of images queued with this user turn. */
  images?: string[]
  files?: string[]
  /** Side answers (/btw, /background) are labelled. */
  label?: string
  /** The user's reaction to an assistant reply (message.react). */
  reaction?: string | null
}

export interface Todo {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | string
  parent?: string | null
}

export interface Subagent extends Omit<Partial<SubagentEventPayload>, 'status'> {
  key: string
  goal: string
  status: string
  lastTool?: string | null
  thinking?: string | null
  updatedAt: number
}

export interface PendingAttachment {
  key: string
  kind: 'image' | 'file' | 'pdf'
  name: string
  /** Gateway path of a queued image (image.attach_bytes) used for image.detach. */
  path?: string | null
  /** @file: reference to prepend to the prompt (file.attach). */
  refText?: string | null
  previewUri?: string | null
  uploading?: boolean
}

export interface ChatSession {
  runtimeId: string
  storedId: string | null
  title: string | null
  info: SessionLiveInfo | null
  messages: ChatMessage[]
  streamingId: string | null
  busy: boolean
  turnStartedAt: number | null
  status: string | null
  usage: Usage | null
  todos: Todo[]
  subagents: Record<string, Subagent>
  queue: string[]
  attachments: PendingAttachment[]
  historyLoaded: boolean
  historyOffset: number
  hasMore: boolean
  loadingHistory: boolean
  error: string | null
}

let counter = 0
export const localId = (prefix = 'm') => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`

export function textOf(message: ChatMessage) {
  return message.parts
    .filter((p): p is { kind: 'text'; text: string } => p.kind === 'text')
    .map((p) => p.text)
    .join('')
}
