/**
 * Next-run preview for the schedule field. Hermes evaluates schedules on the server, in its own
 * time zone, so cron fields are matched against the server's wall clock (offset taken from a
 * timestamp the server produced). Natural-language schedules are left to the server: no preview.
 */

import { t } from '@/i18n'

const DAY = 86_400_000

function parseField(field: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>()
  for (const part of field.split(',')) {
    const m = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/)
    if (!m) return null
    const step = m[2] ? Number(m[2]) : 1
    if (!step) return null
    let lo = min
    let hi = max
    if (m[1] !== '*') {
      const [a, b] = m[1].split('-').map(Number)
      lo = a
      hi = b ?? (m[2] ? max : a)
    }
    if (lo < min || hi > max || lo > hi) return null
    for (let v = lo; v <= hi; v += step) out.add(v)
  }
  return out
}

interface Cron {
  minutes: number[]
  hours: number[]
  dom: Set<number>
  months: Set<number>
  dow: Set<number>
  domAny: boolean
  dowAny: boolean
}

function parseCron(expr: string): Cron | null {
  const f = expr.trim().split(/\s+/)
  if (f.length !== 5) return null
  const minutes = parseField(f[0], 0, 59)
  const hours = parseField(f[1], 0, 23)
  const dom = parseField(f[2], 1, 31)
  const months = parseField(f[3], 1, 12)
  const dow = parseField(f[4], 0, 7)
  if (!minutes || !hours || !dom || !months || !dow) return null
  if (dow.has(7)) dow.add(0)
  return {
    minutes: [...minutes].sort((a, b) => a - b),
    hours: [...hours].sort((a, b) => a - b),
    dom,
    months,
    dow,
    domAny: f[2] === '*',
    dowAny: f[4] === '*',
  }
}

/** "every 30m", "every 2h", "every 1d" → minutes. */
function parseInterval(text: string): number | null {
  const m = text
    .trim()
    .toLowerCase()
    .match(/^every\s+(\d+)\s*(m|min|mins|minutes?|h|hr|hrs|hours?|d|days?)$/)
  if (!m) return null
  const n = Number(m[1])
  const unit = m[2][0]
  return n * (unit === 'm' ? 1 : unit === 'h' ? 60 : 1440)
}

/** Server UTC offset in minutes from an ISO timestamp it wrote (e.g. a job's next_run_at). */
export function offsetFromIso(iso?: string | null): number | null {
  const m = iso?.match(/([+-])(\d{2}):?(\d{2})$/)
  if (!m) return iso?.endsWith('Z') ? 0 : null
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
}

/**
 * Up to `count` upcoming run instants (ms since epoch), or null when the schedule is not an
 * interval or a five-field cron expression.
 */
export function nextRuns(schedule: string, serverOffsetMin: number, count = 3, now = Date.now()): number[] | null {
  const every = parseInterval(schedule)
  if (every) return Array.from({ length: count }, (_, i) => now + (i + 1) * every * 60_000)
  const cron = parseCron(schedule)
  if (!cron) return null
  const shift = serverOffsetMin * 60_000
  // Work in the server's wall clock: a UTC Date shifted by the offset reads as server-local fields.
  const wall = new Date(now + shift)
  const startDay = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate())
  const out: number[] = []
  for (let d = 0; d < 400 && out.length < count; d++) {
    const day = new Date(startDay + d * DAY)
    if (!cron.months.has(day.getUTCMonth() + 1)) continue
    const domHit = cron.dom.has(day.getUTCDate())
    const dowHit = cron.dow.has(day.getUTCDay())
    // Vixie cron: when both day fields are restricted, either one matching is enough.
    const dayOk = cron.domAny && cron.dowAny ? true : cron.domAny ? dowHit : cron.dowAny ? domHit : domHit || dowHit
    if (!dayOk) continue
    for (const h of cron.hours) {
      for (const m of cron.minutes) {
        const instant = startDay + d * DAY + h * 3_600_000 + m * 60_000 - shift
        if (instant > now) {
          out.push(instant)
          if (out.length >= count) return out
        }
      }
    }
  }
  return out
}

/** Wall-clock label in the server's zone, e.g. "Mon 09:00" (or with the date when not this week). */
export function serverWallClock(instant: number, serverOffsetMin: number, locale?: string) {
  const d = new Date(instant + serverOffsetMin * 60_000)
  const sameWeek = instant - Date.now() < 6 * DAY
  return d.toLocaleString(locale, {
    timeZone: 'UTC',
    weekday: 'short',
    ...(sameWeek ? {} : { day: 'numeric', month: 'short' }),
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function offsetLabel(min: number) {
  const sign = min < 0 ? '-' : '+'
  const a = Math.abs(min)
  return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, '0')}` : ''}`
}

// ── job status helpers ─────────────────────────────────────────────────

interface ScheduledJob {
  enabled?: boolean
  next_run_at?: string | null
  scheduler_heartbeat_age_s?: number | null
}

/**
 * The ticker only runs while the gateway (or a desktop-owned serve) is up, so a job whose
 * next_run_at sits more than a few minutes in the past is stuck, not just running late.
 */
/** Enabled job whose next scheduled fire time has already passed. */
export function jobOverdue(job: ScheduledJob, now = Date.now()): boolean {
  return !!job.enabled && !!job.next_run_at && Date.parse(String(job.next_run_at)) <= now
}

export function schedulerStalled(jobs: ScheduledJob[], now = Date.now()): boolean {
  return jobs.some(
    (j) =>
      j.enabled &&
      j.next_run_at &&
      Date.parse(j.next_run_at) < now - 3 * 60_000 &&
      (j.scheduler_heartbeat_age_s == null || j.scheduler_heartbeat_age_s > 180),
  )
}

function describeInterval(minutes: number): string {
  if (minutes < 60) return t('Every {n} minutes', { n: minutes })
  if (minutes % 1440 === 0) return minutes === 1440 ? t('Every day') : t('Every {n} days', { n: minutes / 1440 })
  if (minutes % 60 === 0) return minutes === 60 ? t('Every hour') : t('Every {n} hours', { n: minutes / 60 })
  return t('Every {n} minutes', { n: minutes })
}

const dayName = (dow: number) =>
  [t('Sunday'), t('Monday'), t('Tuesday'), t('Wednesday'), t('Thursday'), t('Friday'), t('Saturday')][dow % 7]

const single = (field: string) => (/^\d+$/.test(field) ? Number(field) : null)
const hhmm = (m: number, h: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

/** Human label for an "every Nm/h/d" or five-field cron expression; null when it can't be read. */
export function describeScheduleText(schedule: string): string | null {
  const every = parseInterval(schedule)
  if (every != null) return describeInterval(every)
  const f = schedule.trim().split(/\s+/)
  if (f.length !== 5) return null
  const [min, hour, dom, mon, dow] = f
  const m = single(min)
  const h = single(hour)
  if (m === 0 && hour === '*' && dom === '*' && mon === '*' && dow === '*') return t('Every hour')
  if (m == null || h == null) return null
  const time = hhmm(m, h)
  if (dom === '*' && mon === '*' && dow === '*') return t('Every day at {time}', { time })
  if (dom === '*' && mon === '*' && dow === '1-5') return t('Weekdays at {time}', { time })
  if (dom === '*' && mon === '*' && single(dow) != null) return t('Every {day} at {time}', { day: dayName(Number(dow)), time })
  if (mon === '*' && dow === '*' && single(dom) != null) return t('Monthly on day {d} at {time}', { d: Number(dom), time })
  return null
}

/** Best human label for a job's schedule, falling back to whatever the backend displays. */
export function describeSchedule(job: {
  schedule?: { kind?: string; expr?: string; display?: string; minutes?: number }
  schedule_display?: string | null
}): string {
  if (job.schedule?.kind === 'interval' && job.schedule.minutes) return describeInterval(job.schedule.minutes)
  const expr = job.schedule?.expr ?? job.schedule_display ?? ''
  return (expr && describeScheduleText(expr)) || job.schedule_display || job.schedule?.display || job.schedule?.expr || ''
}
