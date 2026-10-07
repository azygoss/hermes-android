import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect } from 'react'
import { AppState } from 'react-native'

import type { CronJob } from '@/components/cron/types'
import { toast } from '@/components/ui/Dialogs'
import { t } from '@/i18n'
import { CHANNELS, notify } from '@/lib/notify'
import { useRuntime, type HermesConnection } from '@/lib/hermes'
import { useSettings } from '@/store/settings'

const DAY = 24 * 60 * 60_000
const MAX_ANNOUNCED = 5

interface CronRun {
  id: string
  source?: string
  title?: string | null
  preview?: string | null
}

/**
 * Diff the jobs' last_run_at stamps against the map stored last time. A null `seen` is the first
 * check ever: it only sets the baseline and reports nothing, so enabling the feature (or installing
 * the app) never floods the user with notifications for old runs.
 */
export function diffCronRuns(seen: Record<string, string> | null, jobs: CronJob[]): { next: Record<string, string>; fresh: CronJob[] } {
  const next: Record<string, string> = {}
  for (const job of jobs) if (job.last_run_at) next[job.id] = job.last_run_at
  const fresh =
    seen === null
      ? []
      : jobs
          .filter((job) => job.last_run_at && job.last_run_at !== seen[job.id])
          .sort((a, b) => Date.parse(b.last_run_at!) - Date.parse(a.last_run_at!))
  return { next, fresh }
}

const seenKey = (h: HermesConnection) => `hermes.cron-seen.${h.conn.id}.${h.profile ?? '-'}`

async function announceRun(h: HermesConnection, job: CronJob, foreground: boolean) {
  const res = await h.rest
    .get<{ runs?: CronRun[] } | CronRun[]>(`/api/cron/jobs/${encodeURIComponent(job.id)}/runs`, { query: { limit: 1 } })
    .catch(() => null)
  const run = (Array.isArray(res) ? res : (res?.runs ?? []))[0]
  // Script-only rows have no chat to open; agent runs are ordinary stored sessions.
  const storedId = run && run.source !== 'cron_output' ? run.id : undefined
  const failed = !['ok', 'success'].includes(job.last_status ?? '')
  const name = job.name || job.prompt?.slice(0, 40) || job.id
  const title = failed ? t('Scheduled job failed: {name}', { name }) : t('Scheduled job finished: {name}', { name })
  const raw = failed ? job.last_error || job.last_delivery_error || job.last_status : run?.preview || run?.title || t('Tap to see the result.')
  const body = raw ? String(raw).slice(0, 180) : undefined
  if (foreground) {
    toast(title, failed ? 'warn' : 'success')
    return
  }
  // The identifier makes the same run reported by the foreground watcher and the background task
  // collapse into one notification.
  await notify(CHANNELS.cron, { title, body, data: { cronJobId: job.id, storedId } }, `cron:${job.id}:${job.last_run_at}`)
}

async function runCheck(h: HermesConnection, foreground: boolean) {
  const res = await h.rest.get<CronJob[] | { jobs?: CronJob[] }>('/api/cron/jobs')
  const jobs = Array.isArray(res) ? res : (res?.jobs ?? [])
  const key = seenKey(h)
  let seen: Record<string, string> | null = null
  try {
    const parsed: unknown = JSON.parse((await AsyncStorage.getItem(key)) ?? 'null')
    // Anything but a map is corrupt state; treat it like the first-ever check.
    seen = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, string>) : null
  } catch {
    seen = null
  }
  const { next, fresh } = diffCronRuns(seen, jobs)
  // The baseline is written even with the setting off, so toggling it on later cannot flood.
  await AsyncStorage.setItem(key, JSON.stringify(next))
  if (!useSettings.getState().notifyCron) return
  const cutoff = Date.now() - DAY
  const recent = fresh.filter((job) => Date.parse(job.last_run_at!) >= cutoff)
  for (const job of recent.slice(0, MAX_ANNOUNCED)) await announceRun(h, job, foreground)
  if (recent.length > MAX_ANNOUNCED) {
    const title = t('{n} more scheduled jobs ran', { n: recent.length - MAX_ANNOUNCED })
    if (foreground) toast(title, 'info')
    else await notify(CHANNELS.cron, { title })
  }
}

let queue: Promise<void> = Promise.resolve()

/** Serialised so a debounced event, a reconnect and the background task never race on `seen`. */
export function checkCronRuns(h: HermesConnection, { foreground }: { foreground: boolean }): Promise<void> {
  queue = queue.then(() => runCheck(h, foreground)).catch(() => {})
  return queue
}

/**
 * Foreground watcher: a `cron.changed` gateway event (debounced — the scheduler emits one per job)
 * or the socket (re)opening, which covers runs that happened while the connection was down.
 */
export function useCronWatch() {
  const hermes = useRuntime((s) => s.hermes)
  const state = useRuntime((s) => s.state)
  const foreground = () => AppState.currentState === 'active'

  useEffect(() => {
    if (!hermes) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const off = hermes.gateway.onEvent((event) => {
      if (event.type !== 'cron.changed') return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void checkCronRuns(hermes, { foreground: foreground() }), 1500)
    })
    return () => {
      off()
      if (timer) clearTimeout(timer)
    }
  }, [hermes])

  useEffect(() => {
    if (state === 'open' && hermes) void checkCronRuns(hermes, { foreground: foreground() })
  }, [state, hermes])
}
