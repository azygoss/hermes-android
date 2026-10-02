import { Stack, useLocalSearchParams } from 'expo-router'
import { View } from 'react-native'

import { Card, ErrorState, KeyValue, Loading, Screen, Section, Text } from '@/components/ui'
import { useT } from '@/i18n'
import { compact, money } from '@/lib/format'
import { useRpc } from '@/lib/hooks'
import { useChat } from '@/store/chat'
import { radius, space, useTheme } from '@/theme'

export default function UsageScreen() {
  const t = useT()
  const { c } = useTheme()
  const { sid } = useLocalSearchParams<{ sid: string }>()
  const live = useChat((s) => s.sessions[sid]?.usage)
  const usage = useRpc(['session.usage', sid], 'session.usage', { session_id: sid })
  const ctx = useRpc(['session.context_breakdown', sid], 'session.context_breakdown', { session_id: sid })
  const bars = useRpc(['usage.bars'], 'usage.bars', {})
  const u = { ...(live ?? {}), ...((usage.data as object) ?? {}) } as Record<string, number | string | null | undefined>
  const breakdown = ctx.data
  const total = breakdown?.context_max || 1

  return (
    <Screen refreshing={usage.isRefetching} onRefresh={() => (usage.refetch(), ctx.refetch(), bars.refetch())}>
      <Stack.Screen options={{ title: t('Usage & context') }} />
      {usage.isLoading ? <Loading /> : null}
      {usage.error ? <ErrorState error={usage.error} onRetry={() => usage.refetch()} /> : null}

      {breakdown ? (
        <Card>
          <Text weight="semibold">{t('Context window')}</Text>
          <Text variant="h2">
            {compact(breakdown.context_used)} / {compact(breakdown.context_max)}{' '}
            <Text tone="muted">({Math.round(breakdown.context_percent)}%)</Text>
          </Text>
          <View
            style={{ flexDirection: 'row', height: 14, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: c.surfaceAlt }}
            accessibilityLabel={t('Context usage bar')}
          >
            {breakdown.categories.map((cat) => (
              <View key={cat.id} style={{ width: `${(cat.tokens / total) * 100}%`, backgroundColor: cat.color || c.accent }} />
            ))}
          </View>
          <View style={{ gap: 6 }}>
            {breakdown.categories.map((cat) => (
              <View key={cat.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: cat.color || c.accent }} />
                <Text variant="small" style={{ flex: 1 }}>
                  {cat.label}
                </Text>
                <Text variant="small" tone="muted">
                  {compact(cat.tokens)}
                </Text>
              </View>
            ))}
            {!breakdown.categories.length ? (
              <Text variant="small" tone="muted">
                {t('No turns yet in this chat.')}
              </Text>
            ) : null}
          </View>
          {breakdown.context_estimated ? (
            <Text variant="caption" tone="faint">
              {t('Estimated — the provider did not report exact counts.')}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Section title={t('Tokens')}>
        <View style={{ padding: space.lg }}>
          <KeyValue label={t('Model')} value={String(u.model ?? '—')} />
          <KeyValue label={t('Input')} value={compact(u.input as number)} />
          <KeyValue label={t('Output')} value={compact(u.output as number)} />
          <KeyValue label={t('Reasoning')} value={compact(u.reasoning as number)} />
          <KeyValue label={t('Cache read / write')} value={`${compact(u.cache_read as number)} / ${compact(u.cache_write as number)}`} />
          <KeyValue label={t('Cache hit rate')} value={u.cache_hit_pct != null ? `${u.cache_hit_pct}%` : '—'} />
          <KeyValue label={t('API calls')} value={compact(u.calls as number)} />
          <KeyValue label={t('Compressions')} value={compact(u.compressions as number)} />
          <KeyValue label={t('Speed')} value={u.avg_tps != null ? `${u.avg_tps} tok/s` : '—'} />
          <KeyValue label={t('Average latency')} value={u.avg_latency_s != null ? `${u.avg_latency_s}s` : '—'} />
          <KeyValue label={t('Cost')} value={u.cost_usd != null ? money(u.cost_usd as number) : String(u.cost_status ?? '—')} />
        </View>
      </Section>

      {bars.data && (bars.data as { available?: boolean }).available ? (
        <Section title={t('Plan')}>
          <View style={{ padding: space.lg, gap: space.sm }}>
            {(['plan_bar', 'topup_bar'] as const).map((k) => {
              const bar = (bars.data as Record<string, any>)[k]
              if (!bar) return null
              return (
                <View key={k} style={{ gap: 4 }}>
                  <Text variant="small">
                    {bar.kind === 'plan' ? t('Subscription') : t('Top-up')}: {bar.remaining_display} / {bar.total_display}
                  </Text>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}>
                    <View style={{ width: `${Math.min(100, bar.pct_used ?? 0)}%`, height: 8, backgroundColor: c.accent }} />
                  </View>
                </View>
              )
            })}
            <Text variant="caption" tone="faint">
              {(bars.data as { plan_name?: string }).plan_name ?? ''}
            </Text>
          </View>
        </Section>
      ) : null}
    </Screen>
  )
}
