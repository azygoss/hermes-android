import { useQuery } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { Brain, Check, Database, RotateCcw, Settings2, User } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { FieldInput, type FieldSpec } from '@/components/FieldInput'
import { LearningNodeSheet, type LearningNode } from '@/components/LearningNodeSheet'
import {
  Badge,
  Button,
  confirm,
  EmptyState,
  ErrorState,
  Loading,
  Row,
  Screen,
  Section,
  Segmented,
  Sheet,
  Text,
  toast,
  toastError,
} from '@/components/ui'
import { useT } from '@/i18n'
import { relativeTime } from '@/lib/format'
import { useRest } from '@/lib/hooks'
import { rest } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { space, useTheme } from '@/theme'

interface Graph {
  nodes: LearningNode[]
  memory: { source: string; timestamp: number; title: string; body: string; fingerprint: string }[]
  stats: Record<string, number>
}

interface MemoryStatus {
  active: string
  providers: {
    name: string
    description: string
    available: boolean
    configured: boolean
    status: string
    setup?: { required_env?: string[]; external_dependencies?: { name: string; install: string }[] }
  }[]
  builtin_files?: { memory?: { chars?: number; limit?: number } | number; user?: { chars?: number; limit?: number } | number }
}

export default function MemoryScreen() {
  const t = useT()
  const { c } = useTheme()
  const graph = useRest<Graph>(['learning-graph'], '/api/learning/graph')
  const status = useRest<MemoryStatus>(['memory-status'], '/api/memory')
  const [tab, setTab] = useState<'user' | 'memory'>('user')
  const [node, setNode] = useState<LearningNode | null>(null)
  const [provider, setProvider] = useState<string | null>(null)

  const memNodes = (graph.data?.nodes ?? []).filter((n) => n.kind === 'memory')
  const userNodes = memNodes.filter((n) => n.memorySource === 'profile' || n.memorySource === 'user')
  const agentNodes = memNodes.filter((n) => !(n.memorySource === 'profile' || n.memorySource === 'user'))
  const shown = tab === 'user' ? userNodes : agentNodes

  async function activate(name: string) {
    try {
      await rest().put('/api/memory/provider', { provider: name })
      toast(name ? t('Memory provider: {name}', { name }) : t('Using built-in memory only'), 'success')
      void status.refetch()
    } catch (e) {
      toastError(e)
    }
  }

  async function reset(target: 'all' | 'memory' | 'user') {
    const labels = { all: t('all memory'), memory: t("the agent's notes"), user: t('what it knows about you') }
    if (
      !(await confirm(t('Reset {what}?', { what: labels[target] }), t('This cannot be undone.'), {
        destructive: true,
        confirmLabel: t('Reset'),
      }))
    )
      return
    try {
      await rest().post('/api/memory/reset', { target })
      toast(t('Memory reset'), 'success')
      void graph.refetch()
    } catch (e) {
      toastError(e)
    }
  }

  return (
    <Screen refreshing={graph.isRefetching} onRefresh={() => (graph.refetch(), status.refetch())}>
      <Stack.Screen options={{ title: t('Memory') }} />
      <Text tone="muted" variant="small">
        {t(
          'Hermes keeps two notebooks: USER.md (who you are) and MEMORY.md (what it learned while working). It also searches past sessions.',
        )}
      </Text>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'user', label: t('About you ({n})', { n: userNodes.length }) },
          { value: 'memory', label: t('Agent notes ({n})', { n: agentNodes.length }) },
        ]}
      />
      {graph.isLoading ? <Loading /> : null}
      {graph.error ? <ErrorState error={graph.error} onRetry={() => graph.refetch()} /> : null}
      {shown.length ? (
        <Section>
          {shown
            .slice()
            .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
            .map((n, i, all) => (
              <Row
                key={n.id}
                icon={tab === 'user' ? User : Brain}
                title={n.label}
                subtitle={relativeTime(n.timestamp)}
                numberOfLines={1}
                onPress={() => setNode(n)}
                last={i === all.length - 1}
              />
            ))}
        </Section>
      ) : !graph.isLoading ? (
        <EmptyState
          icon={Brain}
          title={t('Nothing remembered yet')}
          body={t('Hermes saves facts as you work together. Tell it "remember that…" in a chat.')}
        />
      ) : null}

      <Section title={t('Memory provider')} footer={t('External providers add semantic recall on top of the built-in notebooks.')}>
        <Row
          icon={Database}
          title={t('Built-in only')}
          right={!status.data?.active ? <Check size={18} color={c.accentText} /> : undefined}
          onPress={() => activate('')}
        />
        {(status.data?.providers ?? []).map((p, i, all) => (
          <Row
            key={p.name}
            icon={Settings2}
            title={p.name}
            subtitle={p.description}
            right={
              status.data?.active === p.name ? (
                <Check size={18} color={c.accentText} />
              ) : (
                <Badge label={p.status} tone={p.status === 'ready' ? 'success' : p.available ? 'default' : 'warn'} />
              )
            }
            onPress={() => setProvider(p.name)}
            last={i === all.length - 1}
          />
        ))}
        {status.isLoading ? <Loading /> : null}
      </Section>

      <Section title={t('Danger zone')}>
        <Row icon={RotateCcw} danger title={t('Reset what Hermes knows about you')} onPress={() => reset('user')} />
        <Row icon={RotateCcw} danger title={t("Reset the agent's notes")} onPress={() => reset('memory')} />
        <Row icon={RotateCcw} danger title={t('Reset all memory')} onPress={() => reset('all')} last />
      </Section>

      <LearningNodeSheet node={node} onClose={() => setNode(null)} />
      <ProviderSheet name={provider} active={status.data?.active === provider} onClose={() => setProvider(null)} onActivate={activate} />
    </Screen>
  )
}

interface ProviderConfig {
  name: string
  label: string
  fields: FieldSpec[]
  setup?: { required_env?: string[]; external_dependencies?: { name: string; install: string }[]; dependencies_installed?: boolean }
}

function ProviderSheet({
  name,
  active,
  onClose,
  onActivate,
}: {
  name: string | null
  active: boolean
  onClose: () => void
  onActivate: (n: string) => void
}) {
  const t = useT()
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const cfg = useQuery({
    queryKey: ['memory-provider', name],
    enabled: !!name,
    queryFn: () => rest().get<ProviderConfig>(`/api/memory/providers/${encodeURIComponent(name!)}/config`),
  })

  const save = async () => {
    setBusy('save')
    try {
      await rest().put(`/api/memory/providers/${encodeURIComponent(name!)}/config`, { values })
      toast(t('Saved'), 'success')
      setValues({})
      void cfg.refetch()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(null)
    }
  }
  const setup = async () => {
    setBusy('setup')
    try {
      const res = await rest().post(`/api/memory/providers/${encodeURIComponent(name!)}/setup`, { values }, { timeoutMs: 300_000 })
      toast((res as { message?: string }).message ?? t('Setup finished'), 'success')
      void cfg.refetch()
      void queryClient.invalidateQueries({ queryKey: ['memory-status'] })
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Sheet visible={!!name} onClose={onClose} title={cfg.data?.label ?? name ?? ''}>
      {cfg.isLoading ? <Loading /> : null}
      {cfg.error ? <ErrorState error={cfg.error} /> : null}
      {(cfg.data?.setup?.external_dependencies ?? []).map((d) => (
        <View key={d.name} style={{ gap: 2 }}>
          <Text variant="small" weight="semibold">
            {t('Needs {name} on the backend', { name: d.name })}
          </Text>
          <Text mono variant="caption" selectable>
            {d.install}
          </Text>
        </View>
      ))}
      {(cfg.data?.fields ?? []).map((f) => (
        <FieldInput
          key={f.key}
          spec={f}
          value={f.key in values ? values[f.key] : f.kind === 'secret' ? '' : f.value}
          onChange={(v) => setValues((cur) => ({ ...cur, [f.key]: v }))}
        />
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {cfg.data?.fields?.length ? (
          <Button label={t('Save settings')} variant="secondary" onPress={save} loading={busy === 'save'} />
        ) : null}
        <Button label={t('Run setup')} variant="secondary" onPress={setup} loading={busy === 'setup'} />
        {!active && name ? <Button label={t('Use this provider')} onPress={() => (onActivate(name), onClose())} /> : null}
      </View>
    </Sheet>
  )
}
