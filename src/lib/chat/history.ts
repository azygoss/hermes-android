import type { ChatMessage, Part, ToolPart } from './types'

/** Row shape of GET /api/sessions/{id}/messages. */
export interface SessionMessageRow {
  id?: number
  role: string
  content?: unknown
  tool_calls?: { id?: string; call_id?: string; function?: { name?: string; arguments?: string } }[] | null
  tool_call_id?: string | null
  tool_name?: string | null
  timestamp?: number | null
  reasoning?: string | null
  reasoning_content?: string | null
  display_kind?: string | null
  display_metadata?: Record<string, any> | null
  finish_reason?: string | null
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((p) =>
        typeof p === 'string' ? p : p && typeof p === 'object' && 'text' in p ? String((p as { text: unknown }).text ?? '') : '',
      )
      .join('')
  }
  return content == null ? '' : JSON.stringify(content)
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export function isToolError(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false
  const r = result as Record<string, unknown>
  if (r.error) return true
  if (typeof r.exit_code === 'number' && r.exit_code !== 0) return true
  return r.success === false || r.ok === false
}

/** Pull "@image:<path>" / "@file:<path>" reference lines out of a user turn. */
export function splitRefs(text: string) {
  const images: string[] = []
  const files: string[] = []
  const kept: string[] = []
  for (const line of text.split('\n')) {
    const img = line.match(/^@image:(.+)$/)
    const file = line.match(/^@file:(.+)$/)
    if (img) images.push(img[1].trim())
    else if (file) files.push(file[1].trim())
    else kept.push(line)
  }
  return { text: kept.join('\n').replace(/^\n+/, ''), images, files }
}

/**
 * Fold stored rows into chat bubbles: one user bubble per user row, and every assistant/tool row
 * up to the next user row into a single assistant bubble with ordered reasoning/tool/text parts.
 */
export function foldHistory(rows: SessionMessageRow[], { running = false }: { running?: boolean } = {}): ChatMessage[] {
  const out: ChatMessage[] = []
  let current: ChatMessage | null = null
  const tools = new Map<string, ToolPart>()

  const flush = () => {
    if (current && current.parts.length) out.push(current)
    current = null
  }

  for (const row of rows) {
    if (row.display_kind === 'hidden') continue
    const at = (row.timestamp ?? 0) * 1000
    const id = `row-${row.id ?? Math.random().toString(36).slice(2)}`
    if (row.role === 'user') {
      flush()
      const { text, images, files } = splitRefs(contentText(row.content))
      const label = row.display_kind === 'skill_invocation' ? 'skill' : undefined
      out.push({ id, role: 'user', parts: [{ kind: 'text', text }], at, rowId: row.id ?? null, images, files, label })
      continue
    }
    if (row.role === 'assistant') {
      current ??= { id, role: 'assistant', parts: [], at, rowId: row.id ?? null }
      const reasoning = row.reasoning || row.reasoning_content
      if (reasoning) current.parts.push({ kind: 'reasoning', text: reasoning })
      const text = contentText(row.content)
      if (text.trim()) current.parts.push({ kind: 'text', text })
      for (const call of row.tool_calls ?? []) {
        const callId = call.id || call.call_id || `${id}-${current.parts.length}`
        let args: Record<string, unknown> | null = null
        try {
          args = call.function?.arguments ? JSON.parse(call.function.arguments) : null
        } catch {
          args = { raw: call.function?.arguments }
        }
        const part: ToolPart = { kind: 'tool', id: callId, name: call.function?.name ?? 'tool', args, status: 'running' }
        tools.set(callId, part)
        current.parts.push(part)
      }
      current.rowId = row.id ?? current.rowId
      continue
    }
    if (row.role === 'tool') {
      const text = contentText(row.content)
      const result = parseJson(text)
      const part = row.tool_call_id ? tools.get(row.tool_call_id) : undefined
      const meta = row.display_metadata?.tool_result_metadata
      if (part) {
        part.status = isToolError(result) ? 'error' : 'done'
        part.result = result
        part.resultText = typeof result === 'string' ? result : null
        part.diff = meta?.inline_diff ?? null
        part.summary = meta?.summary ?? null
      } else {
        current ??= { id, role: 'assistant', parts: [], at }
        current.parts.push({
          kind: 'tool',
          id: row.tool_call_id ?? id,
          name: row.tool_name ?? 'tool',
          status: isToolError(result) ? 'error' : 'done',
          result,
          resultText: typeof result === 'string' ? result : null,
        })
      }
      continue
    }
    if (row.role === 'system' && row.display_kind) {
      flush()
      out.push({ id, role: 'system', parts: [{ kind: 'text', text: contentText(row.content) }], at, tone: 'info' })
    }
  }
  flush()
  // Tool calls whose result row never landed (interrupted turns) should not spin forever.
  if (!running) for (const m of out) for (const p of m.parts as Part[]) if (p.kind === 'tool' && p.status === 'running') p.status = 'error'
  return out
}
