import { useQuery } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { Check, ExternalLink, Settings2, Wrench } from 'lucide-react-native'
import * as WebBrowser from 'expo-web-browser'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  Loading,
  Screen,
  Section,
  Sheet,
  Text,
  TextField,
  toast,
  toastError,
  Toggle,
} from '@/components/ui'
import { useT } from '@/i18n'
import { useRest } from '@/lib/hooks'
import { hermes, rest } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { radius, space, useTheme } from '@/theme'

interface ToolsetInfo {
  name: string
  label: string
  description: string
  platform_label?: string
  enabled: boolean
  available?: boolean
  configured: boolean
  tools: string[]
}

interface Provider {
  name: string
  badge?: string
  tag?: string
  env_vars: { key: string; prompt?: string; url?: string | null; default?: string | null; is_set?: boolean }[]
  post_setup?: string | null
  requires_nous_auth?: boolean
  is_active?: boolean
  status?: string
}

export default function ToolsetsScreen() {
  const t = useT()
  const { c } = useTheme()
  const q = useRest<ToolsetInfo[]>(['toolsets'], '/api/tools/toolsets')
  const [open, setOpen] = useState<ToolsetInfo | null>(null)

  async function toggle(ts: ToolsetInfo, enabled: boolean) {
    queryClient.setQueryData<ToolsetInfo[]>(['toolsets'], (old) => old?.map((x) => (x.name === ts.name ? { ...x, enabled } : x)))
    try {
      await rest().put(`/api/tools/toolsets/${encodeURIComponent(ts.name)}`, { enabled, profile: hermes().profile ?? undefined })
      toast(
        enabled ? t('{name} enabled for new chats', { name: ts.label }) : t('{name} disabled for new chats', { name: ts.label }),
        'success',
      )
    } catch (e) {
      toastError(e)
      void q.refetch()
    }
  }

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Stack.Screen options={{ title: t('Toolsets') }} />
      <Text tone="muted" variant="small">
        {t('Toolsets group the tools Hermes can call. Changes apply to new chats; some need an API key or a provider choice.')}
      </Text>
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
      {q.data?.length ? (
        <Section>
          {q.data.map((ts, i) => (
            <View
              key={ts.name}
              style={[styles.row, i < q.data!.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Text weight="semibold">{ts.label}</Text>
                  {!ts.configured ? <Badge label={t('needs setup')} tone="warn" /> : null}
                  {ts.available === false ? <Badge label={t('unavailable')} /> : null}
                </View>
                <Text variant="small" tone="muted" numberOfLines={2}>
                  {ts.description}
                </Text>
                <Text variant="caption" tone="faint" numberOfLines={2} mono>
                  {ts.tools.join(', ')}
                </Text>
              </View>
              <IconButton icon={Settings2} label={t('Configure {name}', { name: ts.label })} onPress={() => setOpen(ts)} size={18} />
              <Toggle value={ts.enabled} onValueChange={(v) => toggle(ts, v)} accessibilityLabel={t('Enable {name}', { name: ts.label })} />
            </View>
          ))}
        </Section>
      ) : !q.isLoading ? (
        <EmptyState icon={Wrench} title={t('No toolsets')} />
      ) : null}
      <ToolsetSheet toolset={open} onClose={() => setOpen(null)} />
    </Screen>
  )
}

function ToolsetSheet({ toolset, onClose }: { toolset: ToolsetInfo | null; onClose: () => void }) {
  const t = useT()
  const { c } = useTheme()
  const [env, setEnv] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const cfg = useQuery({
    queryKey: ['toolset-config', toolset?.name],
    enabled: !!toolset,
    queryFn: () =>
      rest().get<{ providers: Provider[]; active_provider: string | null; has_category: boolean }>(
        `/api/tools/toolsets/${encodeURIComponent(toolset!.name)}/config`,
      ),
  })
  const name = toolset?.name ?? ''
  const profile = () => hermes().profile ?? undefined

  const activate = async (p: Provider) => {
    setBusy(p.name)
    try {
      await rest().put(`/api/tools/toolsets/${encodeURIComponent(name)}/provider`, { provider: p.name, profile: profile() })
      toast(t('Using {name}', { name: p.name }), 'success')
      await cfg.refetch()
      void queryClient.invalidateQueries({ queryKey: ['toolsets'] })
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(null)
    }
  }

  const saveEnv = async (p: Provider) => {
    const values = Object.fromEntries(p.env_vars.map((v) => [v.key, env[v.key] ?? '']).filter(([, v]) => v))
    if (!Object.keys(values).length) return
    setBusy(`env-${p.name}`)
    try {
      const res = await rest().put(`/api/tools/toolsets/${encodeURIComponent(name)}/env`, { env: values, profile: profile() })
      toast(t('Saved {n} keys', { n: (res as { saved?: string[] }).saved?.length ?? 0 }), 'success')
      setEnv({})
      await cfg.refetch()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(null)
    }
  }

  const postSetup = async (p: Provider) => {
    setBusy(`setup-${p.name}`)
    try {
      const res = await rest().post(
        `/api/tools/toolsets/${encodeURIComponent(name)}/post-setup`,
        { key: p.post_setup, profile: profile() },
        { timeoutMs: 300_000 },
      )
      const r = res as { ok?: boolean; error?: string; message?: string }
      if (r.ok === false) throw new Error(r.error || r.message)
      toast(r.message ?? t('Setup started'), 'success')
      setTimeout(() => void cfg.refetch(), 3000)
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Sheet visible={!!toolset} onClose={onClose} title={toolset?.label}>
      <Text tone="muted" variant="small">
        {toolset?.description}
      </Text>
      {cfg.isLoading ? <Loading /> : null}
      {cfg.error ? <ErrorState error={cfg.error} /> : null}
      {cfg.data && !cfg.data.providers.length ? <Text tone="muted">{t('This toolset needs no configuration.')}</Text> : null}
      {(cfg.data?.providers ?? []).map((p) => (
        <View
          key={p.name}
          style={{
            borderWidth: 1,
            borderColor: p.is_active ? c.accent : c.border,
            borderRadius: radius.md,
            padding: space.md,
            gap: space.sm,
            backgroundColor: p.is_active ? c.accentSoft : 'transparent',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text weight="semibold" style={{ flex: 1 }}>
              {p.name}
            </Text>
            {p.badge ? <Badge label={p.badge} /> : null}
            {p.is_active ? <Check size={16} color={c.accentText} /> : null}
          </View>
          {p.tag ? (
            <Text variant="small" tone="muted">
              {p.tag}
            </Text>
          ) : null}
          {p.status && p.status !== 'ready' ? <Badge label={p.status.replace(/_/g, ' ')} tone="warn" /> : null}
          {p.env_vars.map((v) => (
            <View key={v.key} style={{ gap: 4 }}>
              <TextField
                label={`${v.key}${v.is_set ? ` · ${t('set')}` : ''}`}
                value={env[v.key] ?? ''}
                onChangeText={(x) => setEnv((cur) => ({ ...cur, [v.key]: x }))}
                placeholder={v.is_set ? t('Leave empty to keep the current value') : (v.default ?? v.prompt ?? '')}
                secret={/KEY|TOKEN|SECRET|PASSWORD/i.test(v.key)}
                mono
                helper={v.prompt}
              />
              {v.url ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => WebBrowser.openBrowserAsync(v.url!)}
                  style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}
                >
                  <ExternalLink size={12} color={c.accentText} />
                  <Text variant="caption" tone="accent">
                    {t('Get a key')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            {p.env_vars.length ? (
              <Button size="sm" variant="secondary" label={t('Save keys')} loading={busy === `env-${p.name}`} onPress={() => saveEnv(p)} />
            ) : null}
            {p.post_setup ? (
              <Button
                size="sm"
                variant="secondary"
                label={t('Run setup')}
                loading={busy === `setup-${p.name}`}
                onPress={() => postSetup(p)}
              />
            ) : null}
            {!p.is_active ? <Button size="sm" label={t('Use this')} loading={busy === p.name} onPress={() => activate(p)} /> : null}
          </View>
        </View>
      ))}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    paddingLeft: space.lg,
    paddingRight: space.sm,
  },
})
