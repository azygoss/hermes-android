import { Stack } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { CreditCard, ExternalLink, LogIn } from 'lucide-react-native'
import { View } from 'react-native'

import { Badge, Button, Card, EmptyState, ErrorState, KeyValue, Loading, Screen, Section, Text, toast } from '@/components/ui'
import { useT } from '@/i18n'
import { useRpc } from '@/lib/hooks'
import { rpc, useProfile } from '@/lib/hermes'
import { radius, space, useTheme } from '@/theme'

/** Nous Portal plan, credits and balance for the signed-in account. */
export default function BillingScreen() {
  const t = useT()
  const { c } = useTheme()
  const profile = useProfile()
  const billing = useRpc(['billing', profile], 'billing.state', { profile })
  const sub = useRpc(['subscription', profile], 'subscription.state', { profile })
  const bars = useRpc(['usage.bars'], 'usage.bars', {})
  const free = useRpc(['free_tier', profile], 'free_tier.status', { profile })

  if (billing.isLoading || sub.isLoading) return <Loading />
  const b = billing.data
  const s = sub.data
  if (b && !b.logged_in) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('Plan & credits') }} />
        {free.data?.available ? (
          <Card>
            <Text weight="semibold">{t('Nous free tier')}</Text>
            <Text variant="small" tone="muted">
              {free.data.enabled
                ? t('Active: {model}', { model: free.data.label || free.data.model })
                : t('Try Hermes on a free model without an API key.')}
            </Text>
            {!free.data.enabled ? (
              <Button
                label={t('Turn on the free tier')}
                onPress={async () => {
                  const r = await rpc()
                    .request('free_tier.provision', { profile })
                    .catch((e) => ({ enabled: false, error: e instanceof Error ? e.message : String(e) }))
                  if (r.error) toast(r.error, 'warn')
                  void free.refetch()
                }}
                style={{ alignSelf: 'flex-start' }}
              />
            ) : null}
          </Card>
        ) : null}
        <EmptyState
          icon={LogIn}
          title={t('Not signed in to Nous Portal')}
          body={t('Sign in under More → API keys & accounts → Accounts to see your plan and credits.')}
        />
      </Screen>
    )
  }

  const u = bars.data as
    | { plan_bar?: { remaining_display: string; total_display: string; pct_used?: number }; topup_bar?: { remaining_display: string } }
    | undefined
  return (
    <Screen refreshing={billing.isRefetching} onRefresh={() => (billing.refetch(), sub.refetch(), bars.refetch())}>
      <Stack.Screen options={{ title: t('Plan & credits') }} />
      {billing.error ? <ErrorState error={billing.error} /> : null}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <CreditCard size={18} color={c.textMuted} strokeWidth={1.75} />
          <Text weight="semibold" style={{ flex: 1 }}>
            {s?.current?.tier_name ?? (b?.free_tier_account ? t('Free tier') : t('No plan'))}
          </Text>
          {b?.org_name ? <Badge label={b.org_name} /> : null}
        </View>
        {u?.plan_bar ? (
          <View style={{ gap: 4 }}>
            <Text variant="small">
              {t('{left} of {total} left this cycle', { left: u.plan_bar.remaining_display, total: u.plan_bar.total_display })}
            </Text>
            <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}>
              <View style={{ height: 8, width: `${Math.max(0, 100 - (u.plan_bar.pct_used ?? 0))}%`, backgroundColor: c.accent }} />
            </View>
          </View>
        ) : null}
        {b?.balance_display ? <KeyValue label={t('Top-up balance')} value={b.balance_display} /> : null}
        {s?.current?.cycle_ends_at ? <KeyValue label={t('Renews')} value={s.current.cycle_ends_at} /> : null}
        {s?.current?.pending_downgrade_display ? (
          <KeyValue label={t('Scheduled change')} value={s.current.pending_downgrade_display} />
        ) : null}
        {s?.current?.cancel_at_period_end ? <Badge label={t('cancels at period end')} tone="warn" /> : null}
        {b?.free_tier_model ? <KeyValue label={t('Free model')} value={b.free_tier_model} /> : null}
      </Card>
      {s?.tiers?.length ? (
        <Section title={t('Plans')}>
          {s.tiers.map((tier, i) => (
            <View
              key={tier.tier_id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: space.lg,
                gap: space.sm,
                borderBottomWidth: i < s.tiers!.length - 1 ? 1 : 0,
                borderBottomColor: c.border,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text weight="medium">{tier.name}</Text>
                <Text variant="caption" tone="muted">
                  {[tier.dollars_per_month_display, tier.monthly_credits].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {tier.is_current ? <Badge label={t('current')} tone="accent" /> : null}
            </View>
          ))}
        </Section>
      ) : null}
      {s?.portal_url ? (
        <Button icon={ExternalLink} label={t('Manage plan on Nous Portal')} onPress={() => WebBrowser.openBrowserAsync(s.portal_url!)} />
      ) : null}
    </Screen>
  )
}
