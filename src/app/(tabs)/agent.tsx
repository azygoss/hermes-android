import { router } from 'expo-router'
import { Blocks, Brain, Cpu, FolderKanban, KeyRound, Map, Plug, Server, Sparkles, UserCircle2, Wrench } from 'lucide-react-native'

import { ProfileSwitcher } from '@/components/ProfileSwitcher'
import { TabHeader } from '@/components/TabHeader'
import { Row, Screen, Section } from '@/components/ui'
import { useT } from '@/i18n'
import { View } from 'react-native'
import { useTheme } from '@/theme'

export default function AgentHub() {
  const t = useT()
  const { c } = useTheme()
  const go = (path: string) => () => router.push(path as never)
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TabHeader title={t('Agent')} subtitle={t('What Hermes knows and can do')} />
      <Screen>
        <ProfileSwitcher />
        <Section title={t('Brain')}>
          <Row
            icon={Cpu}
            title={t('Models & providers')}
            subtitle={t('Main model, auxiliary models, Mixture of Agents')}
            onPress={go('/models')}
          />
          <Row icon={Brain} title={t('Memory')} subtitle={t('What Hermes remembers about you and your work')} onPress={go('/memory')} />
          <Row
            icon={Map}
            title={t('Learning journey')}
            subtitle={t('Timeline of skills and memories it picked up')}
            onPress={go('/journey')}
          />
          <Row
            icon={UserCircle2}
            title={t('Profiles & personality')}
            subtitle={t('Agents, SOUL.md, personalities')}
            onPress={go('/profiles')}
            last
          />
        </Section>
        <Section title={t('Capabilities')}>
          <Row icon={Sparkles} title={t('Skills')} subtitle={t('Installed skills and the Skills Hub')} onPress={go('/skills')} />
          <Row icon={Wrench} title={t('Toolsets')} subtitle={t('Turn tool groups on or off')} onPress={go('/toolsets')} />
          <Row icon={Server} title={t('MCP servers')} subtitle={t('Connect external tools over MCP')} onPress={go('/mcp')} />
          <Row icon={Plug} title={t('Plugins')} subtitle={t('Install and manage agent plugins')} onPress={go('/plugins')} last />
        </Section>
        <Section title={t('Workspace')}>
          <Row icon={FolderKanban} title={t('Projects')} subtitle={t('Folders and repos the agent works in')} onPress={go('/projects')} />
          <Row
            icon={KeyRound}
            title={t('Credential vault')}
            subtitle={t('Logins the agent can use without seeing them')}
            onPress={go('/vault')}
          />
          <Row
            icon={Blocks}
            title={t('Import sessions')}
            subtitle={t('From Claude Code or Codex on the backend')}
            onPress={go('/import')}
            last
          />
        </Section>
      </Screen>
    </View>
  )
}
