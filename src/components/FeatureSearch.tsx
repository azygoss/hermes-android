import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { FlatList, View } from 'react-native'

import {
  Activity,
  BarChart3,
  Blocks,
  Brain,
  CalendarClock,
  Cpu,
  CreditCard,
  FileCog,
  Fingerprint,
  FolderKanban,
  FolderOpen,
  Gauge,
  Info,
  KanbanSquare,
  KeyRound,
  Languages,
  Link2,
  Map as MapIcon,
  MessagesSquare,
  MonitorPlay,
  Moon,
  PawPrint,
  Plug,
  ScrollText,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  SquareTerminal,
  UserCheck,
  UserCircle2,
  Users,
  Webhook,
  Wrench,
} from '@/components/icons'
import type { LucideIcon } from '@/components/icons'
import { EmptyState, IconButton, Row, Sheet, TextField } from '@/components/ui'
import { useT } from '@/i18n'
import { space } from '@/theme'

interface Feature {
  icon: LucideIcon
  title: string
  subtitle?: string
  route: string
  /** Extra English search terms, so technical words work in any UI language. */
  keywords?: string
  /** Where it lives, shown as the subtitle while searching. */
  hub: string
}

function features(t: ReturnType<typeof useT>): Feature[] {
  const agent = t('Agent')
  const automate = t('Automate')
  const more = t('More')
  return [
    {
      hub: agent,
      icon: Cpu,
      title: t('Models & providers'),
      subtitle: t('Main model, auxiliary models, Mixture of Agents'),
      route: '/models',
      keywords: 'llm provider moa auxiliary default model',
    },
    {
      hub: agent,
      icon: Brain,
      title: t('Memory'),
      subtitle: t('What Hermes remembers about you and your work'),
      route: '/memory',
      keywords: 'user.md memory.md notes forget remember',
    },
    {
      hub: agent,
      icon: MapIcon,
      title: t('Learning journey'),
      subtitle: t('Timeline of skills and memories it picked up'),
      route: '/journey',
      keywords: 'timeline learned',
    },
    {
      hub: agent,
      icon: UserCircle2,
      title: t('Profiles & personality'),
      subtitle: t('Agents, SOUL.md, personalities'),
      route: '/profiles',
      keywords: 'soul personality agent profile',
    },
    {
      hub: agent,
      icon: Sparkles,
      title: t('Skills'),
      subtitle: t('Installed skills and the Skills Hub'),
      route: '/skills',
      keywords: 'skill hub install',
    },
    {
      hub: agent,
      icon: Wrench,
      title: t('Toolsets'),
      subtitle: t('Turn tool groups on or off'),
      route: '/toolsets',
      keywords: 'tools browser web search image generation',
    },
    {
      hub: agent,
      icon: Server,
      title: t('MCP servers'),
      subtitle: t('Connect external tools over MCP'),
      route: '/mcp',
      keywords: 'mcp oauth server',
    },
    {
      hub: agent,
      icon: Plug,
      title: t('Plugins'),
      subtitle: t('Install and manage agent plugins'),
      route: '/plugins',
      keywords: 'plugin extension',
    },
    {
      hub: agent,
      icon: Link2,
      title: t('Connectors'),
      subtitle: t('Gmail, GitHub, Notion… through Nous Portal'),
      route: '/connectors',
      keywords: 'gmail github notion slack google',
    },
    {
      hub: agent,
      icon: PawPrint,
      title: t('Pets'),
      subtitle: t('Pick a mascot for the TUI and desktop'),
      route: '/pets',
      keywords: 'pet mascot',
    },
    {
      hub: agent,
      icon: FolderKanban,
      title: t('Projects'),
      subtitle: t('Folders and repos the agent works in'),
      route: '/projects',
      keywords: 'repo folder workspace cwd',
    },
    {
      hub: agent,
      icon: KeyRound,
      title: t('Credential vault'),
      subtitle: t('Logins the agent can use without seeing them'),
      route: '/vault',
      keywords: '1password bitwarden password login card',
    },
    {
      hub: agent,
      icon: Blocks,
      title: t('Import sessions'),
      subtitle: t('From Claude Code or Codex on the backend'),
      route: '/import',
      keywords: 'claude code codex import',
    },
    {
      hub: automate,
      icon: CalendarClock,
      title: t('Scheduled jobs'),
      subtitle: t('Cron jobs in plain language, delivered anywhere'),
      route: '/cron',
      keywords: 'cron schedule timer daily blueprint',
    },
    {
      hub: automate,
      icon: KanbanSquare,
      title: t('Kanban board'),
      subtitle: t('Tasks for a team of agent profiles'),
      route: '/kanban',
      keywords: 'kanban tasks board',
    },
    {
      hub: automate,
      icon: Users,
      title: t('Group rooms'),
      subtitle: t('Several profiles in one conversation'),
      route: '/groups',
      keywords: 'group room multi agent',
    },
    {
      hub: automate,
      icon: Activity,
      title: t('Background agents'),
      subtitle: t('Everything running right now'),
      route: '/agents',
      keywords: 'subagent process running background',
    },
    {
      hub: automate,
      icon: MessagesSquare,
      title: t('Messaging platforms'),
      subtitle: t('Telegram, Discord, Slack, WhatsApp, Signal…'),
      route: '/messaging',
      keywords: 'telegram discord slack whatsapp signal gateway bot',
    },
    {
      hub: automate,
      icon: UserCheck,
      title: t('Pairing requests'),
      subtitle: t('Approve people who messaged your bot'),
      route: '/pairing',
      keywords: 'pairing allowlist approve',
    },
    {
      hub: automate,
      icon: Webhook,
      title: t('Webhooks'),
      subtitle: t('Trigger the agent from GitHub and other services'),
      route: '/webhooks',
      keywords: 'webhook github trigger',
    },
    {
      hub: more,
      icon: Gauge,
      title: t('Plan limits'),
      subtitle: t('Shows how much is left on each plan'),
      route: '/more',
      keywords: 'usage quota limit codex opencode command code credits',
    },
    { hub: more, icon: Smartphone, title: t('Switch or add a backend'), route: '/connect', keywords: 'connection server backend qr login' },
    {
      hub: more,
      icon: FolderOpen,
      title: t('Files'),
      subtitle: t('Browse, preview, upload and download'),
      route: '/files',
      keywords: 'files upload download browse',
    },
    {
      hub: more,
      icon: BarChart3,
      title: t('Analytics'),
      subtitle: t('Tokens, cost and activity'),
      route: '/analytics',
      keywords: 'tokens cost usage stats',
    },
    {
      hub: more,
      icon: ScrollText,
      title: t('Logs'),
      subtitle: t('Agent, gateway and error logs'),
      route: '/logs',
      keywords: 'logs errors debug',
    },
    {
      hub: more,
      icon: MonitorPlay,
      title: t('Bot screen'),
      subtitle: t('Watch the virtual desktop the agent drives'),
      route: '/screen',
      keywords: 'computer use desktop display vnc',
    },
    {
      hub: more,
      icon: CreditCard,
      title: t('Plan & credits'),
      subtitle: t('Nous Portal subscription and balance'),
      route: '/billing',
      keywords: 'billing subscription nous credits',
    },
    {
      hub: more,
      icon: KeyRound,
      title: t('API keys & accounts'),
      subtitle: t('Provider keys, OAuth logins, credential pools'),
      route: '/keys',
      keywords: 'api key env oauth token pool login',
    },
    {
      hub: more,
      icon: FileCog,
      title: t('Configuration'),
      subtitle: t('config.yaml, form or raw'),
      route: '/config',
      keywords: 'config yaml settings',
    },
    {
      hub: more,
      icon: ShieldCheck,
      title: t('System'),
      subtitle: t('Gateway, updates, doctor, backups, curator'),
      route: '/system',
      keywords: 'update doctor backup restore curator security audit hooks',
    },
    {
      hub: more,
      icon: SquareTerminal,
      title: t('Hermes CLI'),
      subtitle: t('Run hermes subcommands without a terminal'),
      route: '/cli',
      keywords: 'cli terminal command console',
    },
    {
      hub: more,
      icon: Settings2,
      title: t('Settings'),
      subtitle: t('Appearance, language, voice, notifications'),
      route: '/settings',
      keywords: 'settings preferences',
    },
    {
      hub: more,
      icon: Moon,
      title: t('Theme'),
      subtitle: t('Settings'),
      route: '/settings',
      keywords: 'dark light theme accent colour text size',
    },
    {
      hub: more,
      icon: Languages,
      title: t('App language'),
      subtitle: t('Settings'),
      route: '/settings',
      keywords: 'language turkish english',
    },
    {
      hub: more,
      icon: Fingerprint,
      title: t('Lock the app'),
      subtitle: t('Settings'),
      route: '/settings',
      keywords: 'lock fingerprint biometric security',
    },
    { hub: more, icon: Info, title: t('About'), route: '/about', keywords: 'version about' },
  ]
}

function fold(s: string) {
  return s.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i')
}

/** Search button for the Agent / Automate / More headers: finds any screen across the three hubs. */
export function FeatureSearchButton() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const all = useMemo(() => features(t), [t])
  const results = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean)
    if (!words.length) return all
    return all.filter((f) => {
      const hay = fold([f.title, f.subtitle, f.keywords, f.hub].filter(Boolean).join(' '))
      return words.every((w) => hay.includes(w))
    })
  }, [all, q])
  const close = () => {
    setOpen(false)
    setQ('')
  }
  return (
    <>
      <IconButton icon={Search} label={t('Search features')} onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={close} title={t('Find a feature')} noScroll heightRatio={0.9}>
        <View style={{ paddingBottom: space.sm }}>
          <TextField placeholder={t('Telegram, backups, API keys…')} value={q} onChangeText={setQ} autoFocus autoCapitalize="none" />
        </View>
        <FlatList
          data={results}
          keyExtractor={(f) => `${f.route}-${f.title}`}
          keyboardShouldPersistTaps="handled"
          style={{ marginHorizontal: -space.lg }}
          ListEmptyComponent={<EmptyState icon={Search} title={t('Nothing found')} />}
          renderItem={({ item, index }) => (
            <Row
              icon={item.icon}
              title={item.title}
              subtitle={q.trim() ? `${item.hub} · ${item.subtitle ?? ''}`.replace(/ · $/, '') : item.subtitle}
              numberOfLines={1}
              onPress={() => {
                close()
                router.push(item.route as never)
              }}
              last={index === results.length - 1}
            />
          )}
        />
      </Sheet>
    </>
  )
}
