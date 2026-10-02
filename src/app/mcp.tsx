import { Stack } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { KeyRound, LogIn, Plus, RefreshCw, Server, Trash2, Zap } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { StyleSheet, Switch, View } from 'react-native'

import {
  Badge,
  Button,
  confirm,
  EmptyState,
  ErrorState,
  IconButton,
  KeyValue,
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
} from '@/components/ui'
import { useT } from '@/i18n'
import type { McpProbeTool, McpServerSummary } from '@/lib/gateway/contract.generated'
import { useRpc } from '@/lib/hooks'
import { hermes, rest, rpc } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { useChat } from '@/store/chat'
import { space, useTheme } from '@/theme'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function McpScreen() {
  const t = useT()
  const { c } = useTheme()
  const profile = hermes().profile
  const list = useRpc(['mcp', 'list', profile], 'mcp.servers.list', { profile })
  const status = useRpc(['mcp', 'status', profile], 'mcp.servers.status', { profile }, { refetchInterval: 10_000 })
  const catalog = useRpc(['mcp', 'catalog', profile], 'mcp.catalog', { profile })
  const [selected, setSelected] = useState<McpServerSummary | null>(null)
  const [adding, setAdding] = useState(false)
  const statusBy = useMemo(() => Object.fromEntries((status.data?.servers ?? []).map((s) => [s.name, s])), [status.data])
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['mcp'] })

  async function toggle(s: McpServerSummary, enabled: boolean) {
    try {
      await rest().put(`/api/mcp/servers/${encodeURIComponent(s.name)}/enabled`, { enabled, profile: profile ?? undefined })
      await refresh()
    } catch (e) {
      toastError(e)
    }
  }

  async function reload() {
    try {
      const sid = useChat.getState().activeId
      let res = await rpc().request('reload.mcp', { session_id: sid })
      if (res.status === 'confirm_required') {
        if (
          !(await confirm(t('Reload MCP servers?'), res.message ?? t('This invalidates the prompt cache of live chats.'), {
            confirmLabel: t('Reload'),
          }))
        )
          return
        res = await rpc().request('reload.mcp', { session_id: sid, confirm: true })
      }
      toast(t('MCP servers reloaded'), 'success')
      await refresh()
    } catch (e) {
      toastError(e)
    }
  }

  async function installPreset(name: string, requires: string[]) {
    try {
      await rpc().request('mcp.servers.add', { name, preset: name, profile })
      for (const key of requires) {
        const value = await prompt(t('{name} needs {key}', { name, key }), { secret: true })
        if (value) await rpc().request('mcp.servers.set_api_key', { name, value, env_var: key, profile })
      }
      toast(t('{name} added', { name }), 'success')
      await refresh()
    } catch (e) {
      toastError(e)
    }
  }

  const servers = list.data?.servers ?? []
  return (
    <Screen refreshing={list.isRefetching} onRefresh={refresh}>
      <Stack.Screen
        options={{
          title: t('MCP servers'),
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <IconButton icon={RefreshCw} label={t('Reload MCP servers')} onPress={reload} />
              <IconButton icon={Plus} label={t('Add a server')} onPress={() => setAdding(true)} />
            </View>
          ),
        }}
      />
      {list.isLoading ? <Loading /> : null}
      {list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : null}
      {servers.length ? (
        <Section title={t('Configured')}>
          {servers.map((s, i) => {
            const st = statusBy[s.name]
            const tone = st?.connected ? 'success' : st?.status === 'failed' ? 'danger' : st?.disabled ? 'default' : 'warn'
            return (
              <View
                key={s.name}
                style={[styles.row, i < servers.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Row
                    title={s.name}
                    subtitle={[s.transport, s.url ?? s.command, st ? t('{n} tools', { n: st.tools }) : null].filter(Boolean).join(' · ')}
                    right={<Badge label={st?.status ?? (s.enabled ? '…' : 'disabled')} tone={tone} />}
                    onPress={() => setSelected(s)}
                    last
                  />
                </View>
                <Switch
                  value={s.enabled}
                  onValueChange={(v) => toggle(s, v)}
                  trackColor={{ false: c.borderStrong, true: c.accent }}
                  thumbColor={s.enabled ? c.onAccent : c.textMuted}
                  accessibilityLabel={t('Enable {name}', { name: s.name })}
                  style={{ marginRight: space.md }}
                />
              </View>
            )
          })}
        </Section>
      ) : !list.isLoading ? (
        <EmptyState icon={Server} title={t('No MCP servers yet')} body={t('Add one from the catalog below or connect your own.')} />
      ) : null}

      <Section title={t('Catalog')}>
        {(catalog.data?.servers ?? []).map((p, i, all) => (
          <Row
            key={p.name}
            title={p.name}
            subtitle={p.description + (p.requires.length ? `\n${t('Needs')}: ${p.requires.join(', ')}` : '')}
            numberOfLines={3}
            right={
              p.installed ? (
                <Badge label={t('installed')} tone="success" />
              ) : (
                <Button size="sm" label={t('Add')} onPress={() => installPreset(p.name, p.requires)} />
              )
            }
            last={i === all.length - 1}
          />
        ))}
        {catalog.isLoading ? <Loading /> : null}
      </Section>

      <ServerSheet server={selected} onClose={() => setSelected(null)} onChanged={refresh} />
      <AddServerSheet visible={adding} onClose={() => setAdding(false)} onAdded={refresh} />
    </Screen>
  )
}

function ServerSheet({ server, onClose, onChanged }: { server: McpServerSummary | null; onClose: () => void; onChanged: () => void }) {
  const t = useT()
  const profile = hermes().profile
  const [tools, setTools] = useState<McpProbeTool[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const name = server?.name ?? ''

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

  const test = run('test', async () => {
    const res = await rpc().request('mcp.servers.test', { name, profile }, { timeoutMs: 120_000 })
    setTools(res.tools)
    if (!res.ok) toast(res.oauth_needed ? t('This server needs you to sign in first.') : (res.error ?? t('Connection failed')), 'warn')
    else toast(t('Connected: {n} tools', { n: res.tools.length }), 'success')
  })

  const oauth = run('oauth', async () => {
    const start = await rpc().request('mcp.servers.oauth.start', { name, profile })
    await WebBrowser.openBrowserAsync(start.auth_url)
    for (let i = 0; i < 90; i++) {
      const res = await rpc().request('mcp.servers.oauth.poll', { name, session_id: start.session_id, profile })
      if (res.status === 'approved') {
        toast(t('Signed in to {name}', { name }), 'success')
        if (res.tools) setTools(res.tools)
        onChanged()
        return
      }
      if (res.status === 'error') throw new Error(res.error_message ?? t('Sign-in failed'))
      await sleep(2000)
    }
    await rpc()
      .request('mcp.servers.oauth.cancel', { name, session_id: start.session_id, profile })
      .catch(() => {})
    throw new Error(t('Sign-in timed out'))
  })

  const setKey = run('key', async () => {
    const env = await prompt(t('Environment variable'), { initial: server?.env[0] ?? '', placeholder: 'API_KEY' })
    if (env === null) return
    const value = await prompt(t('Value for {env}', { env: env || 'API key' }), { secret: true })
    if (!value) return
    await rpc().request('mcp.servers.set_api_key', { name, value, env_var: env || null, profile })
    toast(t('Saved'), 'success')
    onChanged()
  })

  const remove = run('remove', async () => {
    if (!(await confirm(t('Remove {name}?', { name }), undefined, { destructive: true, confirmLabel: t('Remove') }))) return
    await rpc().request('mcp.servers.remove', { name, profile })
    toast(t('Removed'), 'success')
    onChanged()
    onClose()
  })

  return (
    <Sheet visible={!!server} onClose={() => (setTools(null), onClose())} title={name}>
      {server ? (
        <View style={{ gap: 2 }}>
          <KeyValue label={t('Transport')} value={server.transport} />
          {server.url ? <KeyValue label="URL" value={server.url} mono /> : null}
          {server.command ? <KeyValue label={t('Command')} value={[server.command, ...server.args].join(' ')} mono /> : null}
          {server.env.length ? <KeyValue label={t('Env')} value={server.env.join(', ')} mono /> : null}
          <KeyValue label={t('Auth')} value={server.auth ?? t('none')} />
          <KeyValue label={t('Source')} value={server.plugin ? `${server.source} (${server.plugin})` : server.source} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Button size="sm" icon={Zap} label={t('Test')} loading={busy === 'test'} onPress={test} />
        <Button size="sm" variant="secondary" icon={LogIn} label={t('Sign in (OAuth)')} loading={busy === 'oauth'} onPress={oauth} />
        <Button size="sm" variant="secondary" icon={KeyRound} label={t('Set API key')} loading={busy === 'key'} onPress={setKey} />
        {server?.source !== 'plugin' ? (
          <Button size="sm" variant="dangerGhost" icon={Trash2} label={t('Remove')} loading={busy === 'remove'} onPress={remove} />
        ) : null}
      </View>
      {tools ? (
        <View style={{ gap: space.sm }}>
          <Text weight="semibold">{t('{n} tools', { n: tools.length })}</Text>
          {tools.map((tool) => (
            <View key={tool.name}>
              <Text mono variant="small" weight="medium">
                {tool.name}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={3}>
                {tool.description}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Sheet>
  )
}

function AddServerSheet({ visible, onClose, onAdded }: { visible: boolean; onClose: () => void; onAdded: () => void }) {
  const t = useT()
  const [kind, setKind] = useState<'http' | 'stdio'>('http')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [envText, setEnvText] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    setBusy(true)
    try {
      const env = Object.fromEntries(
        envText
          .split('\n')
          .map((l) => l.split('='))
          .filter((p) => p.length >= 2 && p[0].trim())
          .map(([k, ...v]) => [k.trim(), v.join('=').trim()]),
      )
      const config: Record<string, unknown> =
        kind === 'http' ? { url: url.trim() } : { command: command.trim(), args: args.trim() ? args.trim().split(/\s+/) : [] }
      if (Object.keys(env).length) config.env = env
      await rpc().request('mcp.servers.add', { name: name.trim(), config, bearer_token: token.trim() || null, profile: hermes().profile })
      toast(t('{name} added', { name }), 'success')
      onAdded()
      onClose()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('Add an MCP server')}
      footer={
        <Button
          label={t('Add server')}
          onPress={add}
          loading={busy}
          disabled={!name.trim() || (kind === 'http' ? !url.trim() : !command.trim())}
        />
      }
    >
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'http', label: t('Remote (HTTP)') },
          { value: 'stdio', label: t('Local command') },
        ]}
      />
      <TextField label={t('Name')} value={name} onChangeText={setName} autoCapitalize="none" placeholder="github" />
      {kind === 'http' ? (
        <>
          <TextField
            label="URL"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            keyboardType="url"
            placeholder="https://example.com/mcp"
            mono
          />
          <TextField label={t('Bearer token (optional)')} value={token} onChangeText={setToken} secret mono />
        </>
      ) : (
        <>
          <TextField label={t('Command')} value={command} onChangeText={setCommand} autoCapitalize="none" placeholder="npx" mono />
          <TextField
            label={t('Arguments')}
            value={args}
            onChangeText={setArgs}
            autoCapitalize="none"
            placeholder="-y @modelcontextprotocol/server-filesystem /home/me"
            mono
          />
        </>
      )}
      <TextField
        label={t('Environment (KEY=value per line)')}
        value={envText}
        onChangeText={setEnvText}
        multiline
        mono
        autoCapitalize="none"
      />
      <Text variant="caption" tone="faint">
        {t('Runs on the Hermes backend, not on this phone.')}
      </Text>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
})
