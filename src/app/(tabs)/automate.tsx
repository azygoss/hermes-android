import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { Activity, CalendarClock, KanbanSquare, MessagesSquare, UserCheck, Users, Webhook } from 'lucide-react-native'
import { View } from 'react-native'

import { TabHeader } from '@/components/TabHeader'
import { Badge, Row, Screen, Section } from '@/components/ui'
import { useT } from '@/i18n'
import { rest, useRuntime } from '@/lib/hermes'
import { useTheme } from '@/theme'

export default function AutomateHub() {
  const t = useT()
  const { c } = useTheme()
  const connected = useRuntime((s) => !!s.hermes)
  const status = useQuery({ queryKey: ['status'], enabled: connected, queryFn: () => rest().get('/api/status') })
  const go = (path: string) => () => router.push(path as never)
  const gw = status.data as { gateway_running?: boolean; gateway_platforms?: Record<string, unknown> } | undefined
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TabHeader title={t('Automate')} subtitle={t('Work that happens without you')} />
      <Screen refreshing={status.isRefetching} onRefresh={() => status.refetch()}>
        <Section title={t('Scheduling')}>
          <Row
            icon={CalendarClock}
            title={t('Scheduled jobs')}
            subtitle={t('Cron jobs in plain language, delivered anywhere')}
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
