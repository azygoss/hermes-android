import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { Activity, CalendarClock, KanbanSquare, MessagesSquare, UserCheck, Users, Webhook } from '@/components/icons'
import { View } from 'react-native'

import { FeatureSearchButton } from '@/components/FeatureSearch'
import { TabHeader } from '@/components/TabHeader'
import { Badge, Row, Screen, Section } from '@/components/ui'
import type { CronJob } from '@/components/cron/types'
import { useT } from '@/i18n'
import { jobOverdue, schedulerStalled } from '@/lib/cron'
import { relativeTime } from '@/lib/format'
import { rest, useRuntime } from '@/lib/hermes'
import { useTheme } from '@/theme'

export default function AutomateHub() {
  const t = useT()
  const { c } = useTheme()
  const connected = useRuntime((s) => !!s.hermes)
  const status = useQuery({ queryKey: ['status'], enabled: connected, queryFn: () => rest().get('/api/status') })
  // Same key/path as the cron screen, so the cache is shared.
  const jobs = useQuery({ queryKey: ['cron', 'jobs'], enabled: connected, queryFn: () => rest().get<CronJob[]>('/api/cron/jobs') })
  const go = (path: string) => () => router.push(path as never)
  const gw = status.data as { gateway_running?: boolean; gateway_platforms?: Record<string, unknown> } | undefined

  const jobList = jobs.data ?? []
  const stalled = schedulerStalled(jobList)
  const nextJob = jobList
    .filter((j) => j.enabled && j.next_run_at)
    .sort((a, b) => Date.parse(String(a.next_run_at)) - Date.parse(String(b.next_run_at)))[0]
  const jobsSubtitle = !jobList.length
    ? t('Cron jobs in plain language, delivered anywhere')
    : nextJob && !jobOverdue(nextJob)
      ? t('{n} jobs · next {when}', { n: jobList.length, when: relativeTime(nextJob.next_run_at) })
      : t('{n} jobs', { n: jobList.length })
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TabHeader title={t('Automate')} right={<FeatureSearchButton />} />
      <Screen refreshing={status.isRefetching} onRefresh={() => status.refetch()}>
        <Section title={t('Scheduling')}>
          <Row
            icon={CalendarClock}
            title={t('Scheduled jobs')}
            subtitle={jobsSubtitle}
            right={stalled ? <Badge label={t('not firing')} tone="warn" /> : undefined}
            onPress={go('/cron')}
          />
          <Row icon={KanbanSquare} title={t('Kanban board')} subtitle={t('Tasks for a team of agent profiles')} onPress={go('/kanban')} />
          <Row icon={Users} title={t('Group rooms')} subtitle={t('Several profiles in one conversation')} onPress={go('/groups')} />
          <Row icon={Activity} title={t('Background agents')} subtitle={t('Everything running right now')} onPress={go('/agents')} last />
        </Section>
        <Section title={t('Reach Hermes from anywhere')}>
          <Row
            icon={MessagesSquare}
            title={t('Messaging platforms')}
            subtitle={t('Telegram, Discord, Slack, WhatsApp, Signal…')}
            right={
              gw ? (
                <Badge label={gw.gateway_running ? t('gateway on') : t('gateway off')} tone={gw.gateway_running ? 'success' : 'default'} />
              ) : undefined
            }
            onPress={go('/messaging')}
          />
          <Row
            icon={UserCheck}
            title={t('Pairing requests')}
            subtitle={t('Approve people who messaged your bot')}
            onPress={go('/pairing')}
          />
          <Row
            icon={Webhook}
            title={t('Webhooks')}
            subtitle={t('Trigger the agent from GitHub and other services')}
            onPress={go('/webhooks')}
            last
          />
        </Section>
      </Screen>
    </View>
  )
}
