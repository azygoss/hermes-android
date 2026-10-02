import {
  Brain,
  Code2,
  Eye,
  FileText,
  Globe,
  HelpCircle,
  Image as ImageIcon,
  ListChecks,
  Search,
  Sparkles,
  SquareTerminal,
  Users,
  Volume2,
  Wrench,
} from '@/components/icons'
import type { LucideIcon } from '@/components/icons'

import type { ToolPart } from './types'

const NAMES: Record<string, string> = {
  terminal: 'Terminal',
  process: 'Process',
  read_file: 'Read file',
  write_file: 'Write file',
  patch: 'Edit file',
  search_files: 'Search files',
  web_search: 'Web search',
  web_extract: 'Read web page',
  execute_code: 'Run code',
  delegate_task: 'Delegate',
  memory: 'Memory',
  skill_manage: 'Manage skill',
  skill_view: 'View skill',
  skills_list: 'List skills',
  todo_list: 'Tasks',
  todo: 'Tasks',
  clarify: 'Clarify',
  text_to_speech: 'Speak',
  vision_analyze: 'Look at image',
  image_generate: 'Generate image',
  tool_search: 'Find tool',
  tool_call: 'Call tool',
  tool_describe: 'Describe tool',
  session_search: 'Search sessions',
  cronjob: 'Schedule',
  send_message: 'Send message',
}

export function toolLabel(name: string) {
  if (NAMES[name]) return NAMES[name]
  if (name.startsWith('mcp_')) return `MCP · ${name.slice(4).replace(/_/g, ' ')}`
  const s = name.replace(/^browser_/, 'browser ').replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function toolIcon(name: string): LucideIcon {
  if (name === 'terminal' || name === 'process') return SquareTerminal
  if (/file|patch/.test(name)) return FileText
  if (name.startsWith('browser') || name === 'web_extract') return Globe
  if (/search/.test(name)) return Search
  if (name === 'memory') return Brain
  if (name.startsWith('skill')) return Sparkles
  if (name === 'delegate_task') return Users
  if (name === 'execute_code') return Code2
  if (/image/.test(name)) return ImageIcon
  if (/todo/.test(name)) return ListChecks
  if (name === 'clarify') return HelpCircle
  if (name === 'text_to_speech') return Volume2
  if (name.startsWith('vision')) return Eye
  return Wrench
}

/** One-line description of what the call is doing, from its args. */
export function toolPreview(part: ToolPart): string {
  if (part.context) return part.context
  const a = (part.args ?? {}) as Record<string, unknown>
  const pick = a.command ?? a.path ?? a.file_path ?? a.query ?? a.url ?? a.goal ?? a.name ?? a.code ?? a.text ?? a.question
  if (typeof pick === 'string') return pick.split('\n')[0].slice(0, 160)
  const first = Object.values(a).find((v) => typeof v === 'string') as string | undefined
  return first ? first.split('\n')[0].slice(0, 160) : ''
}

export function formatDuration(s?: number | null) {
  if (s == null) return ''
  if (s < 1) return `${Math.round(s * 1000)}ms`
  if (s < 60) return `${s.toFixed(1)}s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

const IMAGE_RE = /\.(png|jpe?g|webp|gif)$/i

/** Image references a tool result points at: remote URLs or files under the Hermes home. */
export function imagesIn(result: unknown, depth = 0): string[] {
  if (depth > 4 || result == null) return []
  if (typeof result === 'string') {
    if (/^https?:\/\/\S+\.(png|jpe?g|webp|gif)(\?\S*)?$/i.test(result)) return [result]
    if (result.startsWith('/') && IMAGE_RE.test(result)) return [result]
    if (result.startsWith('data:image/')) return [result]
    return []
  }
  if (Array.isArray(result)) return result.flatMap((x) => imagesIn(x, depth + 1)).slice(0, 6)
  if (typeof result === 'object')
    return Object.values(result as Record<string, unknown>)
      .flatMap((x) => imagesIn(x, depth + 1))
      .slice(0, 6)
  return []
}

export function resultText(part: ToolPart): string {
  if (part.resultText) return part.resultText
  const r = part.result
  if (r == null) return ''
  if (typeof r === 'string') return r
  if (typeof r === 'object') {
    const o = r as Record<string, unknown>
    if (typeof o.output === 'string') {
      const err = typeof o.error === 'string' && o.error ? `\n${o.error}` : ''
      return o.output + err
    }
    if (typeof o.content === 'string') return o.content
    if (typeof o.error === 'string') return o.error
  }
  return JSON.stringify(r, null, 2)
}
