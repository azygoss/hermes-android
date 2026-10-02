export interface EnvVarSpec {
  key: string
  required: boolean
  is_set: boolean
  redacted_value?: string | null
  description?: string
  prompt?: string
  help?: string
  url?: string | null
  is_password?: boolean
  advanced?: boolean
}
export interface Platform {
  id: string
  name: string
  description?: string
  docs_url?: string
  enabled: boolean
  configured: boolean
  gateway_running: boolean
  state: string
  error_code?: string | null
  error_message?: string | null
  home_channel?: { platform: string; chat_id: string; name?: string } | null
  env_vars: EnvVarSpec[]
}

export const stateTone = (s: string) =>
  s === 'connected'
    ? 'success'
    : s === 'disabled' || s === 'not_configured'
      ? 'default'
      : s === 'fatal' || s === 'startup_failed'
        ? 'danger'
        : 'warn'
