import { t } from '@/i18n'
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

/**
 * Cron runs open with an injected "[IMPORTANT: You are running as a scheduled cron job. …]"
 * preamble (possibly a second "[IMPORTANT: The following skill(s) …]" block). Drops every
 * leading balanced "[IMPORTANT: …]" block — brackets are counted, since the text itself
 * contains nested ones like "[SILENT]" — plus the whitespace after each.
 */
export function stripCronPreamble(text: string): { text: string; stripped: boolean } {
  const dropBlock = (rest: string, start: number): { text: string; dropped: boolean } => {
    let depth = 0
    for (let i = start; i < rest.length; i++) {
      if (rest[i] === '[') depth++
      else if (rest[i] === ']' && --depth === 0) {
        return { text: rest.slice(0, start) + rest.slice(i + 1), dropped: true }
      }
    }
    return { text: rest, dropped: false }
  }

  let rest = text
  let stripped = false
  for (;;) {
    if (!/^\s*\[IMPORTANT:/.test(rest)) break
    const start = rest.indexOf('[')
    const drop = dropBlock(rest, start)
    if (!drop.dropped) break
    rest = drop.text
    stripped = true
  }
  // With loaded skills the "[IMPORTANT: You are running as a scheduled cron job …]" hint lands
  // mid-message after the skill content, not at the head — drop that block too wherever it sits.
  const hintAt = rest.indexOf('[IMPORTANT: You are running as a scheduled cron job')
  if (hintAt >= 0) {
    const drop = dropBlock(rest, hintAt)
    if (drop.dropped) {
      rest = drop.text.replace(/\n{3,}/g, '\n\n')
      stripped = true
    }
  }
  return { text: rest.replace(/^\s+/, ''), stripped }
}

/**
 * History pages are offset from the newest row, so rows added since the first page shift every
 * later page forward and it re-serves rows already folded. Anything at or past the smallest row
 * id we already loaded (`cutoff`) is a duplicate.
 */
export function dropKnownRows<T extends { id?: number }>(rows: T[], cutoff: number | null): T[] {
  return cutoff == null ? rows : rows.filter((r) => r.id == null || r.id < cutoff)
}

/** A cron reply of exactly "[SILENT]" means the job decided there was nothing to report. */
export const isSilentReply = (text: string) => text.trim() === '[SILENT]'

/** List-preview cleanup: cron preamble off, a silent run described instead of showing "[SILENT]". */
export function previewText(raw?: string | null): string {
  if (!raw) return ''
  const { text } = stripCronPreamble(raw)
  // A preview truncated mid-preamble still opens with "[IMPORTANT:" but never closes the bracket —
  // nothing readable is left, so report empty and let the caller fall back to the title.
  if (/^\[IMPORTANT:/.test(text)) return ''
  return isSilentReply(text) ? t('Nothing new to report — the job stayed silent.') : text
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
      const pre = stripCronPreamble(contentText(row.content))
      const { text, images, files } = splitRefs(pre.text)
      const label = row.display_kind === 'skill_invocation' ? 'skill' : pre.stripped ? 'scheduled' : undefined
      out.push({ id, role: 'user', parts: [{ kind: 'text', text }], at, rowId: row.id ?? null, images, files, label })
      continue
    }
    if (row.role === 'assistant') {
      const text = contentText(row.content)
      if (isSilentReply(text)) {
        // A cron run that decided to stay quiet reads as a muted system line, not an empty bubble.
        flush()
        out.push({
          id,
          role: 'system',
          parts: [{ kind: 'text', text: t('Nothing new to report — the job stayed silent.') }],
          at,
          tone: 'info',
        })
        continue
      }
      current ??= { id, role: 'assistant', parts: [], at, rowId: row.id ?? null }
      const reasoning = row.reasoning || row.reasoning_content
      if (reasoning) current.parts.push({ kind: 'reasoning', text: reasoning })
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
