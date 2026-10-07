export interface CronJob {
  id: string
  name?: string | null
  prompt?: string | null
  script?: string | null
  skills?: string[] | null
  schedule?: { kind?: string; expr?: string; run_at?: string; display?: string; minutes?: number }
  schedule_display?: string | null
  repeat?: { times?: number | null; completed?: number }
  enabled: boolean
  state?: string | null
  deliver?: string | null
  model?: string | null
  provider?: string | null
  no_agent?: boolean | null
  workdir?: string | null
  enabled_toolsets?: string[] | null
  last_run_at?: string | null
  next_run_at?: string | null
  last_status?: string | null
  last_error?: string | null
  last_delivery_error?: string | null
  /** Seconds since the scheduler ticker last ran; null when it never did (no gateway). */
  scheduler_heartbeat_age_s?: number | null
  latest_execution?: {
    status?: string | null
    started_at?: string | null
    finished_at?: string | null
  } | null
  profile_name?: string | null
}
