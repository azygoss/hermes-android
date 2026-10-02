import { Stack } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { Card, ErrorState, Loading, Screen, Section, Segmented, Text } from '@/components/ui'
import { useT } from '@/i18n'
import { compact, money } from '@/lib/format'
import { useRest } from '@/lib/hooks'
import { space, useTheme } from '@/theme'

interface Daily {
  day: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens?: number
  reasoning_tokens?: number
  estimated_cost: number
  actual_cost?: number
  sessions: number
  api_calls: number
}
interface ByModel {
  model: string
  input_tokens: number
  output_tokens: number
  estimated_cost: number
  sessions: number
  api_calls: number
}
interface Usage {
  daily: Daily[]
  by_model: ByModel[]
  by_task?: { task: string; input_tokens: number; output_tokens: number; api_calls: number }[]
  totals?: Record<string, number>
  skills?: { top_skills?: { name: string; count?: number; uses?: number }[] }
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1, minWidth: '45%', padding: space.md, gap: 2 }}>
      <Text variant="h2">{value}</Text>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </Card>
  )
}

/** Single-series daily bar chart: one hue, thin bars, tap a bar to read its value. */
function DailyBars({ data }: { data: Daily[] }) {
  const { c } = useTheme()
  const t = useT()
  const [picked, setPicked] = useState<number | null>(null)
  const values = data.map((d) => d.input_tokens + d.output_tokens)
  const max = Math.max(1, ...values)
  const sel = picked != null ? data[picked] : data[data.length - 1]
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="small" tone="muted">
        {sel
          ? t('{day}: {tokens} tokens · {sessions} sessions', {
              day: sel.day,
              tokens: compact(sel.input_tokens + sel.output_tokens),
              sessions: sel.sessions,
            })
          : ''}
      </Text>
      <View style={[styles.plot, { borderBottomColor: c.border }]} accessibilityLabel={t('Daily tokens chart')}>
        {values.map((v, i) => (
          <Pressable
            key={data[i].day}
            onPress={() => setPicked(i)}
            accessibilityRole="button"
            accessibilityLabel={`${data[i].day}: ${compact(v)}`}
            style={styles.barHit}
          >
            <View
              style={{
                height: `${Math.max(2, (v / max) * 100)}%`,
                backgroundColor: c.accent,
                opacity: picked == null || picked === i ? 1 : 0.45,
                borderTopLeftRadius: 4,
                borderTopRightRadius: 4,
              }}
            />
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" tone="faint">
          {data[0]?.day}
        </Text>
        <Text variant="caption" tone="faint">
          {t('max {n}', { n: compact(max) })}
        </Text>
        <Text variant="caption" tone="faint">
          {data[data.length - 1]?.day}
        </Text>
      </View>
    </View>
  )
}

export default function AnalyticsScreen() {
  const t = useT()
  const { c } = useTheme()
  const [days, setDays] = useState<'7' | '30' | '90'>('30')
  const q = useRest<Usage>(['analytics', days], '/api/analytics/usage', { days })
  const d = q.data
  const totals = d?.totals ?? {}
  const sum = (k: keyof Daily) => (d?.daily ?? []).reduce((a, x) => a + (Number(x[k]) || 0), 0)
  const input = totals.total_input ?? sum('input_tokens')
  const output = totals.total_output ?? sum('output_tokens')
  const cost = totals.total_actual_cost || totals.total_estimated_cost || sum('estimated_cost')
  const sessions = totals.total_sessions ?? sum('sessions')
  const calls = totals.total_api_calls ?? sum('api_calls')

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Stack.Screen options={{ title: t('Analytics') }} />
      <Segmented
        value={days}
        onChange={setDays}
        options={[
          { value: '7', label: t('7 days') },
          { value: '30', label: t('30 days') },
          { value: '90', label: t('90 days') },
        ]}
      />
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
      {d ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <Tile label={t('Tokens in')} value={compact(input)} />
            <Tile label={t('Tokens out')} value={compact(output)} />
            <Tile label={t('Sessions')} value={compact(sessions)} />
            <Tile label={t('Cost')} value={money(cost)} />
          </View>
          {d.daily.length ? (
            <Card>
              <Text weight="semibold">{t('Tokens per day')}</Text>
              <DailyBars data={d.daily} />
            </Card>
          ) : null}
          <Section title={t('By model')}>
            {d.by_model.map((m, i) => (
              <View
                key={m.model}
                style={[
                  styles.row,
                  i < d.by_model.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text weight="medium" mono numberOfLines={1}>
                    {m.model}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {t('{s} sessions · {c} calls', { s: m.sessions, c: m.api_calls })}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="small">{compact(m.input_tokens + m.output_tokens)}</Text>
                  <Text variant="caption" tone="muted">
                    {money(m.estimated_cost)}
                  </Text>
                </View>
              </View>
            ))}
          </Section>
          {d.by_task?.length ? (
            <Section title={t('Side tasks')}>
              {d.by_task.map((task, i) => (
                <View
                  key={task.task}
                  style={[
                    styles.row,
                    i < d.by_task!.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
                  ]}
                >
                  <Text style={{ flex: 1 }}>{task.task.replace(/_/g, ' ')}</Text>
                  <Text variant="small" tone="muted">
                    {t('{n} calls', { n: task.api_calls })} · {compact(task.input_tokens + task.output_tokens)}
                  </Text>
                </View>
              ))}
            </Section>
          ) : null}
          <Section title={t('Daily breakdown')}>
            {[...d.daily].reverse().map((row, i) => (
              <View
                key={row.day}
                style={[styles.row, i < d.daily.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}
              >
                <Text variant="small" style={{ flex: 1 }}>
                  {row.day}
                </Text>
                <Text variant="small" tone="muted">
                  {compact(row.input_tokens)} / {compact(row.output_tokens)} · {t('{n} sess', { n: row.sessions })}
                </Text>
              </View>
            ))}
          </Section>
          <Text variant="caption" tone="faint">
            {t('{calls} API calls in this period.', { calls: compact(calls) })}
          </Text>
        </>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  plot: { height: 140, flexDirection: 'row', alignItems: 'flex-end', gap: 2, borderBottomWidth: 1 },
  barHit: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
})
