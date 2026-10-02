import { router } from 'expo-router'
import {
  BarChart3,
  CreditCard,
  FileCog,
  FolderOpen,
  Info,
  KeyRound,
  MonitorPlay,
  ScrollText,
  Settings2,
  ShieldCheck,
  Smartphone,
  Wifi,
} from '@/components/icons'
import { View } from 'react-native'

import { AccountLimitsSection, useAccountLimits } from '@/components/AccountLimits'
import { TabHeader } from '@/components/TabHeader'
import { Badge, Row, Screen, Section } from '@/components/ui'
import { useT } from '@/i18n'
import { useRuntime } from '@/lib/hermes'
import { useConnections } from '@/store/connections'
import { useTheme } from '@/theme'

export default function MoreHub() {
  const t = useT()
  const { c } = useTheme()
  const conn = useConnections((s) => s.connections.find((x) => x.id === s.activeId))
  const state = useRuntime((s) => s.state)
  const limits = useAccountLimits()
  const go = (path: string) => () => router.push(path as never)
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TabHeader title={t('More')} />
      <Screen refreshing={limits.isRefetching} onRefresh={() => limits.refetch()}>
        <Section title={t('Connection')}>
          <Row
            icon={Wifi}
            title={conn?.name ?? t('Not connected')}
            subtitle={conn?.baseUrl}
            right={<Badge label={state === 'open' ? t('online') : state} tone={state === 'open' ? 'success' : 'warn'} />}
            onPress={() => router.push({ pathname: '/connect', params: conn ? { edit: conn.id } : {} })}
          />
          <Row icon={Smartphone} title={t('Switch or add a backend')} onPress={go('/connect')} last />
        </Section>
        <AccountLimitsSection />
        <Section title={t('Backend')}>
          <Row icon={FolderOpen} title={t('Files')} subtitle={t('Browse, preview, upload and download')} onPress={go('/files')} />
          <Row icon={BarChart3} title={t('Analytics')} subtitle={t('Tokens, cost and activity')} onPress={go('/analytics')} />
          <Row icon={ScrollText} title={t('Logs')} subtitle={t('Agent, gateway and error logs')} onPress={go('/logs')} />
          <Row
            icon={MonitorPlay}
            title={t('Bot screen')}
            subtitle={t('Watch the virtual desktop the agent drives')}
            onPress={go('/screen')}
          />
          <Row
            icon={CreditCard}
            title={t('Plan & credits')}
            subtitle={t('Nous Portal subscription and balance')}
            onPress={go('/billing')}
          />
          <Row
            icon={KeyRound}
            title={t('API keys & accounts')}
            subtitle={t('Provider keys, OAuth logins, credential pools')}
            onPress={go('/keys')}
          />
          <Row icon={FileCog} title={t('Configuration')} subtitle={t('config.yaml, form or raw')} onPress={go('/config')} />
          <Row
            icon={ShieldCheck}
            title={t('System')}
            subtitle={t('Gateway, updates, doctor, backups, curator')}
            onPress={go('/system')}
            last
          />
        </Section>
        <Section title={t('App')}>
          <Row
            icon={Settings2}
            title={t('Settings')}
            subtitle={t('Appearance, language, voice, notifications')}
            onPress={go('/settings')}
          />
          <Row icon={Info} title={t('About')} onPress={go('/about')} last />
        </Section>
      </Screen>
    </View>
  )
}
