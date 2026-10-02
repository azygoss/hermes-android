import Constants from 'expo-constants'
import { Stack } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { BookOpen, Code2, MessageCircle } from 'lucide-react-native'
import { View } from 'react-native'

import { HermesMark } from '@/components/HermesMark'
import { KeyValue, Row, Screen, Section, Text } from '@/components/ui'
import { useT } from '@/i18n'
import { useRest } from '@/lib/hooks'
import { useRuntime } from '@/lib/hermes'
import { space } from '@/theme'

export default function AboutScreen() {
  const t = useT()
  const health = useRest<{ version?: string; displayVersion?: string }>(['health'], '/api/health')
  const conn = useRuntime((s) => s.hermes?.conn)
  return (
    <Screen>
      <Stack.Screen options={{ title: t('About') }} />
      <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
        <HermesMark size={80} />
        <Text variant="h1">Hermes</Text>
        <Text tone="muted" center>
          {t('An Android client for Hermes Agent by Nous Research.')}
        </Text>
      </View>
      <Section title={t('Versions')}>
        <View style={{ padding: space.lg }}>
          <KeyValue label={t('App')} value={Constants.expoConfig?.version ?? '?'} />
          <KeyValue label={t('Hermes backend')} value={health.data?.displayVersion ?? health.data?.version ?? '—'} />
          <KeyValue label={t('Backend address')} value={conn?.baseUrl ?? '—'} mono />
          <KeyValue label={t('Gateway protocol')} value="tui_gateway JSON-RPC v1" />
        </View>
      </Section>
      <Section title={t('Links')}>
        <Row
          icon={Code2}
          title={t('App source code')}
          subtitle="github.com/azygoss/hermes-android"
          onPress={() => WebBrowser.openBrowserAsync('https://github.com/azygoss/hermes-android')}
        />
        <Row
          icon={Code2}
          title="Hermes Agent"
          subtitle="github.com/NousResearch/hermes-agent"
          onPress={() => WebBrowser.openBrowserAsync('https://github.com/NousResearch/hermes-agent')}
        />
        <Row
          icon={BookOpen}
          title={t('Documentation')}
          onPress={() => WebBrowser.openBrowserAsync('https://hermes-agent.nousresearch.com/docs/')}
        />
        <Row
          icon={MessageCircle}
          title={t('Nous Research Discord')}
          onPress={() => WebBrowser.openBrowserAsync('https://discord.gg/NousResearch')}
          last
        />
      </Section>
      <Text variant="caption" tone="faint" center>
        {t('Not affiliated with Nous Research. MIT licensed.')}
      </Text>
    </Screen>
  )
}
