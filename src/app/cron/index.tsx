import { useQuery } from '@tanstack/react-query'
import { router, Stack } from 'expo-router'
import { AlertTriangle, CalendarClock, History, Pencil, Play, Plus, Trash2 } from '@/components/icons'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import {
  Badge,
  Button,
  Card,
  confirm,
  EmptyState,
  ErrorState,
  IconButton,
  Loading,
  Row,
  Screen,
  Segmented,
  Sheet,
  Text,
  toast,
  toastError,
  Toggle,
} from '@/components/ui'
import { useT } from '@/i18n'
import { describeSchedule, jobOverdue, schedulerStalled } from '@/lib/cron'
import { endReasonLabel, relativeTime } from '@/lib/format'
import { useRest } from '@/lib/hooks'
import { rest } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { radius, space, useTheme } from '@/theme'

import { BlueprintsTab } from '@/components/cron/Blueprints'
import type { CronJob } from '@/components/cron/types'

/** Priority: paused > overdue > running > last result. */
function statusPill(job: CronJob, t: (s: string) => string): { label: string; tone: 'default' | 'accent' | 'success' | 'danger' | 'warn' } | null {
  if (!job.enabled) return { label: t('Paused'), tone: 'default' }
  if (job.next_run_at && Date.parse(String(job.next_run_at)) < Date.now() - 3 * 60_000) return { label: t('Overdue'), tone: 'warn' }
  if (job.latest_execution?.started_at && !job.latest_execution.finished_at) return { label: t('Running'), tone: 'accent' }
  if (!job.last_status) return null
  return ['ok', 'success'].includes(job.last_status)
    ? { label: t('OK'), tone: 'success' }
    : { label: t('Failed'), tone: 'danger' }
}

export default function CronScreen() {
  const t = useT()
  const { c } = useTheme()
  const [tab, setTab] = useState<'jobs' | 'blueprints'>('jobs')
  const jobs = useRest<CronJob[]>(['cron', 'jobs'], '/api/cron/jobs')
  const targets = useRest<{ targets: { id: string; name: string }[] }>(['cron', 'targets'], '/api/cron/delivery-targets')
  const [selected, setSelected] = useState<CronJob | null>(null)
  const [startingGw, setStartingGw] = useState(false)
  const stalled = schedulerStalled(jobs.data ?? [])
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['cron'] })
  const deliveryName = (id?: string | null) =>
    !id ? null : id === 'local' ? t('Saved on the backend') : ((targets.data?.targets ?? []).find((x) => x.id === id)?.name ?? id)

  async function startGateway() {
    setStartingGw(true)
    try {
      await rest().post('/api/gateway/start', undefined, { noProfile: true, timeoutMs: 120_000 })
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['status'] })
        void queryClient.invalidateQueries({ queryKey: ['cron'] })
      }, 3000)
    } catch (e) {
      toastError(e)
    } finally {
      setStartingGw(false)
    }
  }

  async function setEnabled(job: CronJob, enabled: boolean) {
    queryClient.setQueryData<CronJob[]>(['cron', 'jobs'], (old) => old?.map((j) => (j.id === job.id ? { ...j, enabled } : j)))
    try {
      await rest().post(`/api/cron/jobs/${encodeURIComponent(job.id)}/${enabled ? 'resume' : 'pause'}`)
    } catch (e) {
      toastError(e)
    }
    void refresh()
  }

  return (
    <Screen refreshing={jobs.isRefetching} onRefresh={refresh}>
      <Stack.Screen
        options={{
          title: t('Scheduled jobs'),
          headerRight: () => <IconButton icon={Plus} label={t('New job')} onPress={() => router.push('/cron/edit')} />,
        }}
      />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'jobs', label: t('Jobs ({n})', { n: jobs.data?.length ?? 0 }) },
          { value: 'blueprints', label: t('Blueprints') },
        ]}
      />
      {tab === 'blueprints' ? (
        <BlueprintsTab onCreated={() => (setTab('jobs'), refresh())} />
      ) : (
        <>
          {jobs.isLoading ? <Loading /> : null}
          {jobs.error ? <ErrorState error={jobs.error} onRetry={() => jobs.refetch()} /> : null}
          {stalled ? (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <AlertTriangle size={18} color={c.warn} strokeWidth={1.75} />
                <Text weight="semibold" tone="warn" style={{ flex: 1 }}>
                  {t('Scheduled jobs are not running')}
                </Text>
              </View>
              <Text variant="small" tone="muted">
                {t('Jobs fire only while the Hermes gateway is running on the backend. It looks stopped.')}
              </Text>
              <Button size="sm" label={t('Start gateway')} loading={startingGw} onPress={startGateway} style={{ alignSelf: 'flex-start' }} />
            </Card>
          ) : null}
          {!jobs.isLoading && !jobs.data?.length ? (
            <EmptyState
              icon={CalendarClock}
              title={t('No scheduled jobs')}
              body={t('Ask Hermes in plain language ("every weekday at 9 summarise my inbox") or create one here.')}
              action={<Button label={t('New job')} icon={Plus} onPress={() => router.push('/cron/edit')} />}
            />
          ) : null}
          {(jobs.data ?? []).map((job) => (
            <View
              key={job.id}
              style={[styles.card, { backgroundColor: c.surface, borderColor: job.last_status === 'error' ? c.danger : c.border }]}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => setSelected(job)}
                style={({ pressed }) => [styles.cardBody, { opacity: job.enabled ? (pressed ? 0.7 : 1) : 0.55 }]}
              >
                <Text weight="semibold" numberOfLines={1}>
                  {job.name || job.prompt?.slice(0, 60) || job.id}
                </Text>
                <Text variant="small" tone="muted">
                  {describeSchedule(job)}
                  {job.next_run_at && job.enabled ? (
                    jobOverdue(job) ? (
                      <Text variant="small" tone="warn">
                        {` · ${t('overdue {when}', { when: relativeTime(job.next_run_at) })}`}
                      </Text>
                    ) : (
                      ` · ${t('next {when}', { when: relativeTime(job.next_run_at) })}`
                    )
                  ) : null}
                </Text>
                {job.prompt ? (
                  <Text variant="small" tone="faint" numberOfLines={2}>
                    {job.prompt}
                  </Text>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {(() => {
                    const pill = statusPill(job, t)
                    return pill ? <Badge label={pill.label} tone={pill.tone} /> : null
                  })()}
                  <Text variant="caption" tone="faint" numberOfLines={1}>
                    {[
                      job.last_run_at ? t('Last run {when}', { when: relativeTime(job.last_run_at) }) : null,
                      deliveryName(job.deliver),
                      job.no_agent ? t('script') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                {job.last_error ? (
                  <Text variant="caption" tone="danger" numberOfLines={3}>
                    {job.last_error}
                  </Text>
                ) : null}
              </Pressable>
              <Toggle
                value={job.enabled}
                onValueChange={(v) => setEnabled(job, v)}
                accessibilityLabel={t('Enable {name}', { name: job.name ?? job.id })}
                style={{ marginTop: space.md, marginRight: space.md }}
              />
            </View>
          ))}
        </>
      )}
      <JobSheet job={selected} onClose={() => setSelected(null)} onChanged={refresh} />
    </Screen>
  )
}

function JobSheet({ job, onClose, onChanged }: { job: CronJob | null; onClose: () => void; onChanged: () => void }) {
  const t = useT()
  const [busy, setBusy] = useState<string | null>(null)
  const runs = useQuery({
    queryKey: ['cron', 'runs', job?.id],
    enabled: !!job,
    queryFn: () =>
      rest().get<{
        runs: { id: string; started_at?: number; ended_at?: number; title?: string; message_count?: number; end_reason?: string }[]
      }>(`/api/cron/jobs/${encodeURIComponent(job!.id)}/runs`, { query: { limit: 15 } }),
  })
  const run = (key: string, fn: () => Promise<void>) => async () => {
    setBusy(key)
    try {
      await fn()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(null)
    }
  }
  return (
    <Sheet visible={!!job} onClose={onClose} title={job?.name || t('Job')}>
      {job?.prompt ? <Text>{job.prompt}</Text> : null}
      {job?.script ? (
        <Text mono variant="small" selectable>
          {job.script}
        </Text>
      ) : null}
      <Text variant="small" tone="muted">
        {[job ? describeSchedule(job) : null, job?.model, job?.workdir, job?.skills?.length ? t('skills: {s}', { s: job.skills.join(', ') }) : null]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {job?.last_delivery_error ? (
        <Text variant="small" tone="danger">
          {t('Delivery failed: {e}', { e: job.last_delivery_error })}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Button
          size="sm"
          icon={Play}
          label={t('Run now')}
          loading={busy === 'run'}
          onPress={run('run', async () => {
            await rest().post(`/api/cron/jobs/${encodeURIComponent(job!.id)}/trigger`)
            toast(t('Started'), 'success')
            setTimeout(() => void runs.refetch(), 4000)
            onChanged()
          })}
        />
        <Button
          size="sm"
          variant="secondary"
          icon={Pencil}
          label={t('Edit')}
          onPress={() => (onClose(), router.push({ pathname: '/cron/edit', params: { id: job!.id } }))}
        />
        <Button
          size="sm"
          variant="dangerGhost"
          icon={Trash2}
          label={t('Delete')}
          onPress={run('delete', async () => {
            if (!(await confirm(t('Delete this job?'), undefined, { destructive: true, confirmLabel: t('Delete') }))) return
            await rest().del(`/api/cron/jobs/${encodeURIComponent(job!.id)}`)
            toast(t('Deleted'), 'success')
            onChanged()
            onClose()
          })}
        />
      </View>
      <Text weight="semibold">{t('Recent runs')}</Text>
      {runs.isLoading ? <Loading /> : null}
      {(runs.data?.runs ?? []).map((r, i, all) => (
        <View key={r.id} style={{ marginHorizontal: -space.lg }}>
          <Row
            icon={History}
            title={relativeTime(r.started_at)}
            subtitle={[endReasonLabel(r.end_reason), r.message_count ? t('{n} msgs', { n: r.message_count }) : null].filter(Boolean).join(' · ')}
            onPress={() => (onClose(), router.navigate({ pathname: '/chat', params: { stored: r.id } }))}
            last={i === all.length - 1}
          />
        </View>
      ))}
      {!runs.isLoading && !runs.data?.runs?.length ? (
        <Text variant="small" tone="muted">
          {t('No runs yet.')}
        </Text>
      ) : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg },
  cardBody: { flex: 1, padding: space.lg, gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
})
