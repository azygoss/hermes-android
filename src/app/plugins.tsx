import { useQuery } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { Download, Plug, Plus, RefreshCw, Settings2, Trash2 } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { FieldInput } from '@/components/FieldInput'
import {
  Badge,
  Button,
  confirm,
  EmptyState,
  ErrorState,
  IconButton,
  Loading,
  prompt,
  Row,
  Screen,
  Section,
  Segmented,
  Sheet,
  Text,
  TextField,
  toast,
  toastError,
  Toggle,
} from '@/components/ui'
import { useT } from '@/i18n'
import type { AgentPluginRow } from '@/lib/gateway/contract.generated'
import { useRpc } from '@/lib/hooks'
import { hermes, rest, rpc, useProfile } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { space, useTheme } from '@/theme'

interface CatalogEntry {
  name: string
  repo: string
  description: string
  tier?: string
  installed?: boolean
}

function describeResult(
  t: (s: string, v?: Record<string, string | number>) => string,
  r: { restart_required?: boolean | null; warnings?: string[] | null; missing_env?: string[] | null },
) {
  const notes = [
    r.restart_required ? t('Restart the gateway to finish.') : null,
    r.missing_env?.length ? t('Missing env: {keys}', { keys: r.missing_env.join(', ') }) : null,
    ...(r.warnings ?? []),
  ].filter(Boolean)
  return notes.join(' ')
}

export default function PluginsScreen() {
  const t = useT()
  const { c } = useTheme()
  const profile = useProfile()
  const list = useRpc(['plugins', profile], 'plugins.manage', { action: 'list', profile })
  const catalog = useQuery({
    queryKey: ['plugins', 'catalog'],
    queryFn: () => rest().get<{ entries: CatalogEntry[] }>('/api/dashboard/plugins/catalog'),
  })
  const [tab, setTab] = useState<'installed' | 'catalog'>('installed')
  const [settingsFor, setSettingsFor] = useState<AgentPluginRow | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['plugins'] })
  const plugins = list.data?.plugins ?? []
  const installedNames = useMemo(() => new Set(plugins.map((p) => p.catalog_name ?? p.name)), [plugins])

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try {
      await fn()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(null)
    }
  }

  const toggle = (p: AgentPluginRow, enable: boolean) =>
    run(p.key, async () => {
      const r = await rpc().request('plugins.manage', { action: 'toggle', key: p.key, name: p.name, enable, profile })
      const note = describeResult(t, r)
      toast(note || (enable ? t('{name} enabled', { name: p.name }) : t('{name} disabled', { name: p.name })), note ? 'warn' : 'success')
      await refresh()
    })

  const update = (p: AgentPluginRow) =>
    run(p.key, async () => {
      let r = await rpc().request('plugins.manage', { action: 'update', key: p.key, name: p.name, profile }, { timeoutMs: 300_000 })
      const consent = r as { consent_required?: boolean; delta?: unknown }
      if (consent.consent_required) {
        if (
          !(await confirm(t('The update asks for new capabilities'), JSON.stringify(consent.delta ?? {}, null, 2), {
            confirmLabel: t('Accept and update'),
          }))
        )
          return
        r = await rpc().request(
          'plugins.manage',
          { action: 'update', key: p.key, name: p.name, accept_capabilities: true, profile },
          { timeoutMs: 300_000 },
        )
      }
      toast(r.unchanged ? t('Already up to date') : describeResult(t, r) || t('Updated'), 'success')
      await refresh()
    })

  const remove = (p: AgentPluginRow) =>
    run(p.key, async () => {
      if (!(await confirm(t('Remove {name}?', { name: p.name }), undefined, { destructive: true, confirmLabel: t('Remove') }))) return
      await rpc().request('plugins.manage', { action: 'remove', key: p.key, name: p.name, profile })
      toast(t('Removed'), 'success')
      await refresh()
    })

  const install = (args: { catalog_name?: string; identifier?: string }) =>
    run(args.catalog_name ?? args.identifier ?? 'install', async () => {
      const r = await rpc().request('plugins.manage', { action: 'install', ...args, profile }, { timeoutMs: 600_000 })
      toast(describeResult(t, r) || t('Installed {name}', { name: r.name ?? r.plugin_name ?? '' }), 'success')
      await refresh()
    })

  return (
    <Screen refreshing={list.isRefetching} onRefresh={refresh}>
      <Stack.Screen
        options={{
          title: t('Plugins'),
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <IconButton
                icon={RefreshCw}
                label={t('Rescan plugins')}
                onPress={() => run('rescan', async () => (await rest().get('/api/dashboard/plugins/rescan'), await refresh()))}
              />
              <IconButton
                icon={Plus}
                label={t('Install from Git')}
                onPress={async () => {
                  const identifier = await prompt(t('Install a plugin'), {
                    placeholder: 'https://github.com/owner/repo',
                    message: t('Git URL or owner/repo'),
                  })
                  if (identifier) await install({ identifier })
                }}
              />
            </View>
          ),
        }}
      />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'installed', label: t('Installed ({n})', { n: plugins.length }) },
          { value: 'catalog', label: t('Catalog') },
        ]}
      />
      {list.isLoading ? <Loading /> : null}
      {list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : null}
      {tab === 'installed' ? (
        plugins.length ? (
          <Section>
            {plugins.map((p, i) => {
              const enabled = p.status === 'enabled'
              return (
                <View
                  key={p.key}
                  style={[
                    styles.item,
                    i < plugins.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Text weight="semibold">{p.name}</Text>
                        <Text variant="caption" tone="faint">
                          v{p.version}
                        </Text>
                        <Badge label={p.source} />
                        {p.update_available ? <Badge label={t('update')} tone="info" /> : null}
                      </View>
                      <Text variant="small" tone="muted" numberOfLines={3}>
                        {p.description}
                      </Text>
                      {p.servers.map((s) => (
                        <Text key={s.name} variant="caption" tone={s.state === 'connected' ? 'faint' : 'warn'}>
                          {s.name}: {s.sentence}
                        </Text>
                      ))}
                    </View>
                    <Toggle
                      value={enabled}
                      disabled={busy === p.key}
                      onValueChange={(v) => toggle(p, v)}
                      accessibilityLabel={t('Enable {name}', { name: p.name })}
                    />
                  </View>
                  <View style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }}>
                    {p.settings_schema?.length ? (
                      <Button size="sm" variant="secondary" icon={Settings2} label={t('Settings')} onPress={() => setSettingsFor(p)} />
                    ) : null}
                    {p.source !== 'bundled' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={Download}
                        label={t('Update')}
                        loading={busy === p.key}
                        onPress={() => update(p)}
                      />
                    ) : null}
                    {p.source !== 'bundled' ? (
                      <Button size="sm" variant="dangerGhost" icon={Trash2} label={t('Remove')} onPress={() => remove(p)} />
                    ) : null}
                  </View>
                </View>
              )
            })}
          </Section>
        ) : !list.isLoading ? (
          <EmptyState icon={Plug} title={t('No plugins')} />
        ) : null
      ) : (
        <Section>
          {catalog.isLoading ? <Loading /> : null}
          {(catalog.data?.entries ?? []).map((e, i, all) => (
            <Row
              key={e.name}
              title={e.name}
              subtitle={e.description}
              numberOfLines={4}
              right={
                installedNames.has(e.name) ? (
                  <Badge label={t('installed')} tone="success" />
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    label={t('Install')}
                    loading={busy === e.name}
                    onPress={() => install({ catalog_name: e.name })}
                  />
                )
              }
              last={i === all.length - 1}
            />
          ))}
        </Section>
      )}
      <PluginSettings plugin={settingsFor} onClose={() => setSettingsFor(null)} onSaved={refresh} />
    </Screen>
  )
}

function PluginSettings({ plugin, onClose, onSaved }: { plugin: AgentPluginRow | null; onClose: () => void; onSaved: () => void }) {
  const t = useT()
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!plugin) return
    setBusy(true)
    try {
      const r = await rpc().request('plugins.manage', {
        action: 'settings',
        key: plugin.key,
        name: plugin.name,
        values,
        profile: hermes().profile,
      })
      toast(describeResult(t, r) || t('Saved'), 'success')
      setValues({})
      onSaved()
      onClose()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet
      visible={!!plugin}
      onClose={onClose}
      title={t('{name} settings', { name: plugin?.name ?? '' })}
      footer={<Button label={t('Save')} onPress={save} loading={busy} />}
    >
      {(plugin?.settings_schema ?? []).map((f) => (
        <FieldInput
          key={f.key}
          spec={{ ...f, kind: f.type === 'enum' ? 'select' : f.type === 'string' ? 'text' : f.type, has_value: f.has_value ?? undefined }}
          value={f.key in values ? values[f.key] : f.type === 'secret' ? '' : (f.value ?? f.default)}
          onChange={(v) => setValues((cur) => ({ ...cur, [f.key]: v }))}
        />
      ))}
      {!plugin?.settings_schema?.length ? <TextField editable={false} value={t('No settings')} /> : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  item: { padding: space.lg, gap: space.sm },
})
