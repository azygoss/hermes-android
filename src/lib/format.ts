import { resolveLanguage, t } from '@/i18n'
import { useSettings } from '@/store/settings'

/** Epoch seconds or ms → "5m ago" / "yesterday" / date. */
export function relativeTime(ts?: number | string | null) {
  if (!ts) return ''
  const ms = typeof ts === 'string' ? Date.parse(ts) : ts < 1e12 ? ts * 1000 : ts
  if (Number.isNaN(ms)) return String(ts)
  const diff = Date.now() - ms
  if (diff < -60000) return untilTime(-diff)
  const min = Math.round(diff / 60000)
  if (min < 1) return t('just now')
  if (min < 60) return t('{n}m ago', { n: min })
  const h = Math.round(min / 60)
  if (h < 24) return t('{n}h ago', { n: h })
  const d = Math.round(h / 24)
  if (d === 1) return t('yesterday')
  if (d < 7) return t('{n}d ago', { n: d })
  return new Date(ms).toLocaleDateString()
}

function untilTime(ms: number) {
  const min = Math.round(ms / 60000)
  if (min < 60) return t('in {n}m', { n: min })
  const h = Math.round(min / 60)
  if (h < 24) return t('in {n}h', { n: h })
  return t('in {n}d', { n: Math.round(h / 24) })
}

export function dateTime(ts?: number | string | null) {
  if (!ts) return ''
  const ms = typeof ts === 'string' ? Date.parse(ts) : ts < 1e12 ? ts * 1000 : ts
  if (Number.isNaN(ms)) return String(ts)
  return new Date(ms).toLocaleString()
}

export function compact(n?: number | null) {
  if (n == null) return '—'
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (Math.abs(n) >= 1e4) return `${(n / 1e3).toFixed(1)}k`
  return n.toLocaleString()
}

export function money(n?: number | null) {
  if (n == null) return '—'
  return n < 0.01 && n > 0 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`
}

export function bytes(n?: number | null) {
  if (n == null) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(1)} GB`
}

export function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}

const SOURCE_NAMES: Record<string, () => string> = {
  android: () => t('Phone'),
  cron: () => t('Scheduled'),
  cli: () => t('Terminal'),
  tui: () => t('Terminal'),
  desktop: () => t('Desktop'),
  web: () => t('Web'),
  dashboard: () => t('Web'),
  telegram: () => 'Telegram',
  discord: () => 'Discord',
  slack: () => 'Slack',
  whatsapp: () => 'WhatsApp',
  signal: () => 'Signal',
  matrix: () => 'Matrix',
  email: () => 'Email',
}

/** Display name for a session's source (android → Phone, cron → Scheduled, brands capitalised). */
export function sourceLabel(source?: string | null): string {
  if (!source) return ''
  const named = SOURCE_NAMES[source.toLowerCase()]
  return named ? named() : source
}

const appLocale = () => resolveLanguage(useSettings.getState().language)

/** "14:32" in the app's language. */
export function hhmm(ts: number) {
  return new Date(ts).toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' })
}

/** "Today" / "Yesterday" / weekday + date in the app's language — transcript day separators. */
export function dayLabel(ts: number) {
  const day = new Date(ts).setHours(0, 0, 0, 0)
  const today = new Date().setHours(0, 0, 0, 0)
  if (day === today) return t('Today')
  if (day === today - 86_400_000) return t('Yesterday')
  return new Date(day).toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'short' })
}

const END_REASONS: Record<string, () => string> = {
  cron_complete: () => t('Completed'),
  cron_incomplete_no_output: () => t('No output'),
  complete: () => t('Completed'),
  completed: () => t('Completed'),
  done: () => t('Completed'),
  error: () => t('Error'),
  interrupted: () => t('Interrupted'),
  timeout: () => t('Timed out'),
  idle_timeout: () => t('Timed out'),
  compression: () => t('Compressed'),
  orphaned_compression: () => t('Compressed'),
  session_reset: () => t('Reset'),
  setup_reset: () => t('Reset'),
  branched: () => t('Branched'),
}

/** Human label for a run's end_reason; unknown snake_case internals stay hidden. */
export function endReasonLabel(reason?: string | null): string {
  if (!reason) return ''
  return END_REASONS[reason.toLowerCase()]?.() ?? ''
}
