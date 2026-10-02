import { useQuery } from '@tanstack/react-query'
import { Gauge } from 'lucide-react-native'
import { StyleSheet, View } from 'react-native'

import { Button, Section, Text } from '@/components/ui'
import { useT } from '@/i18n'
import type { ModelOptionsResult } from '@/lib/gateway/contract.generated'
import { relativeTime } from '@/lib/format'
import { rpc, useProfile, useRuntime } from '@/lib/hermes'
import { radius, space, useTheme } from '@/theme'

/** `hermes usage --json` (agent/account_usage.py), one per signed-in provider. */
export interface LimitWindow {
  label: string
  used_percent: number | null
  resets_at: string | null
  detail: string | null
}

export interface AccountLimit {
  provider: string
  name: string
  plan: string | null
  windows: LimitWindow[]
  details: string[]
  unavailable_reason: string | null
  fetched_at: string
}

// Window labels come from the backend; listed here so the catalog extractor sees them.
// t('Session') t('Weekly') t('Monthly') t('Rolling window') t('5-hour window')

/** Profiles that share one account with another provider slug; asking twice would show it twice. */
const SAME_ACCOUNT: Record<string, string> = { 'commandcode-anthropic': 'commandcode' }

function parseDocument(output: string) {
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(output.slice(start, end + 1)) as Omit<AccountLimit, 'name'>
  } catch {
    return null
  }
}

async function fetchLimits(profile: string | null): Promise<AccountLimit[]> {
  const options = (await rpc().request('model.options', { profile })) as ModelOptionsResult
  const seen = new Set<string>()
  const providers = (options.providers ?? []).filter((p) => {
    const account = SAME_ACCOUNT[p.slug] ?? p.slug
    if (!p.authenticated || seen.has(account)) return false
    seen.add(account)
    return true
  })
  const results = await Promise.all(
    providers.map(async (p) => {
      try {
        const res = await rpc().request(
          'cli.exec',
          { argv: ['usage', '--provider', p.slug, '--json'], timeout: 45, profile },
          { timeoutMs: 60_000 },
        )
        if (res.blocked || res.code !== 0) return null
        const doc = parseDocument(res.output)
        return doc && (doc.windows.length || doc.details.length) ? { ...doc, name: p.name } : null
      } catch {
        return null
      }
    }),
  )
  return results.filter((r): r is AccountLimit => !!r)
}

export function useAccountLimits() {
  const profile = useProfile()
  const connected = useRuntime((s) => s.state === 'open')
  return useQuery({
    queryKey: ['account-limits', profile],
    enabled: connected,
    staleTime: 60_000,
    queryFn: () => fetchLimits(profile ?? null),
  })
}

function Meter({ window: w }: { window: LimitWindow }) {
  const { c } = useTheme()
  const t = useT()
  const used = Math.max(0, Math.min(100, w.used_percent ?? 0))
  const left = Math.round(100 - used)
  const fill = used >= 90 ? c.danger : used >= 70 ? c.warn : c.accent
  const meta = [w.resets_at ? t('resets {when}', { when: relativeTime(w.resets_at) }) : null, w.detail].filter(Boolean).join(' · ')
  return (
    <View
      style={{ gap: 6 }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t(w.label)}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(used), text: t('{n}% left', { n: left }) }}
    >
      <View style={styles.meterHead}>
        <Text variant="small" style={{ flex: 1 }}>
          {t(w.label)}
        </Text>
        {w.used_percent != null ? (
          <Text variant="small" weight="medium" style={{ color: used >= 90 ? c.danger : used >= 70 ? c.warn : c.text }}>
            {t('{n}% left', { n: left })}
          </Text>
        ) : null}
      </View>
      {w.used_percent != null ? (
        <View style={[styles.track, { backgroundColor: c.surfaceAlt }]}>
          <View style={[styles.fill, { width: `${100 - used}%`, backgroundColor: fill }]} />
        </View>
      ) : null}
      {meta ? (
        <Text variant="caption" tone="faint">
          {meta}
        </Text>
      ) : null}
    </View>
  )
}

function ProviderLimits({ limit, last }: { limit: AccountLimit; last: boolean }) {
  const { c } = useTheme()
  return (
    <View style={[styles.provider, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
      <View style={styles.meterHead}>
        <Text weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
          {limit.name}
        </Text>
        {limit.plan ? (
          <Text variant="small" tone="muted">
            {limit.plan}
          </Text>
        ) : null}
      </View>
      {limit.unavailable_reason ? (
        <Text variant="small" tone="muted">
          {limit.unavailable_reason}
        </Text>
      ) : null}
      {limit.windows.map((w) => (
        <Meter key={w.label} window={w} />
      ))}
      {limit.details.map((d) => (
        <Text key={d} variant="small" tone="muted">
          {d}
        </Text>
      ))}
    </View>
  )
}

/** "Plan limits" on the More tab: what is left on each subscription the backend is signed in to. */
export function AccountLimitsSection() {
  const t = useT()
  const { c } = useTheme()
  const q = useAccountLimits()
  const connected = useRuntime((s) => s.state === 'open')
  if (!connected && !q.data) return null
  const action = <Button size="sm" variant="ghost" label={t('Refresh')} loading={q.isFetching} onPress={() => q.refetch()} />
  if (q.isLoading)
    return (
      <Section title={t('Plan limits')}>
        <View style={styles.provider}>
          <Text variant="small" tone="muted">
            {t('Asking each provider…')}
          </Text>
          {[0, 1].map((i) => (
            <View key={i} style={[styles.track, { backgroundColor: c.surfaceAlt }]} />
          ))}
        </View>
      </Section>
    )
  if (q.error || !q.data?.length)
    return (
      <Section title={t('Plan limits')} action={action}>
        <View style={[styles.provider, { flexDirection: 'row', alignItems: 'center' }]}>
          <Gauge size={20} color={c.textFaint} strokeWidth={1.75} />
          <Text variant="small" tone="muted" style={{ flex: 1 }}>
            {q.error
              ? t('Could not load plan limits.')
              : t('None of the signed-in providers report limits. Codex, OpenCode Go, Command Code, Anthropic and OpenRouter do.')}
          </Text>
        </View>
      </Section>
    )
  return (
    <Section title={t('Plan limits')} action={action}>
      {q.data.map((limit, i) => (
        <ProviderLimits key={limit.provider} limit={limit} last={i === q.data.length - 1} />
      ))}
    </Section>
  )
}

const styles = StyleSheet.create({
  provider: { padding: space.lg, gap: space.md },
  meterHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  track: { height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
})
