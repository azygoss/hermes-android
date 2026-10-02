import { t } from '@/i18n'

/** Epoch seconds or ms → "5m ago" / "yesterday" / date. */
export function relativeTime(ts?: number | null) {
  if (!ts) return ''
  const ms = ts < 1e12 ? ts * 1000 : ts
  const diff = Date.now() - ms
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
