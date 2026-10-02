import * as Clipboard from 'expo-clipboard'
import { Stack } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { Eye, LogIn, LogOut, Plus, Trash2 } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { View } from 'react-native'

import {
  Button,
  Chip,
  confirm,
  ErrorState,
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
  ToggleRow,
} from '@/components/ui'
import { useT } from '@/i18n'
import { useRest } from '@/lib/hooks'
import { hermes, rest } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { space, useTheme } from '@/theme'

interface EnvVar {
  is_set: boolean
  redacted_value?: string | null
  description?: string
  url?: string | null
  category?: string
  is_password?: boolean
  tools?: string[]
  advanced?: boolean
  provider_label?: string
  custom?: boolean
}
interface OAuthProvider {
  id: string
  name: string
  flow: 'pkce' | 'device_code' | 'external'
  cli_command: string
  docs_url: string
  disconnectable?: boolean
  status: { logged_in: boolean; source_label?: string | null; token_preview?: string | null; expires_at?: string | null; error?: string }
}
interface PoolProvider {
  provider: string
  entries: {
    index: number
    id: string
    label: string
    auth_type: string
    source: string
    token_preview: string
    last_status?: string | null
    request_count?: number
  }[]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function KeysScreen() {
  const t = useT()
  const [tab, setTab] = useState<'keys' | 'accounts' | 'pools'>('keys')
  return (
    <Screen>
      <Stack.Screen options={{ title: t('API keys & accounts') }} />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'keys', label: t('API keys') },
          { value: 'accounts', label: t('Accounts') },
          { value: 'pools', label: t('Key pools') },
        ]}
      />
      {tab === 'keys' ? <EnvKeys /> : tab === 'accounts' ? <OAuthAccounts /> : <Pools />}
    </Screen>
  )
}

function EnvKeys() {
  const t = useT()
  const q = useRest<Record<string, EnvVar>>(['env'], '/api/env')
  const [filter, setFilter] = useState('')
  const [onlySet, setOnlySet] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [category, setCategory] = useState<string | null>('provider')
  const [editing, setEditing] = useState<string | null>(null)

  const categories = useMemo(() => [...new Set(Object.values(q.data ?? {}).map((v) => v.category ?? 'other'))], [q.data])
  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return Object.entries(q.data ?? {})
      .filter(([k, v]) => (!category || v.category === category) && (advanced || !v.advanced) && (!onlySet || v.is_set))
      .filter(([k, v]) => !needle || k.toLowerCase().includes(needle) || (v.description ?? '').toLowerCase().includes(needle))
      .sort(([a, x], [b, y]) => Number(y.is_set) - Number(x.is_set) || a.localeCompare(b))
  }, [q.data, filter, onlySet, advanced, category])

  return (
    <>
      <TextField placeholder={t('Search keys')} value={filter} onChangeText={setFilter} autoCapitalize="characters" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        <Chip label={t('All')} selected={!category} onPress={() => setCategory(null)} />
        {categories.map((c) => (
          <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </View>
      <Section>
        <ToggleRow title={t('Only keys that are set')} value={onlySet} onChange={setOnlySet} />
        <ToggleRow title={t('Show advanced')} value={advanced} onChange={setAdvanced} last />
      </Section>
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
      <Section>
        {rows.map(([key, v], i) => (
          <Row
            key={key}
            title={key}
            mono
            subtitle={[v.provider_label, v.description].filter(Boolean).join(' — ')}
            value={v.is_set ? (v.redacted_value ?? t('set')) : undefined}
            onPress={() => setEditing(key)}
            last={i === rows.length - 1}
          />
        ))}
      </Section>
      <Button
        icon={Plus}
        variant="secondary"
        label={t('Add a custom variable')}
        onPress={async () => {
          const key = await prompt(t('Variable name'), { placeholder: 'MY_API_KEY' })
          if (key) setEditing(key.trim().toUpperCase())
        }}
      />
      <EnvEditor name={editing} spec={editing ? q.data?.[editing] : undefined} onClose={() => setEditing(null)} />
    </>
  )
}

function EnvEditor({ name, spec, onClose }: { name: string | null; spec?: EnvVar; onClose: () => void }) {
  const t = useT()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const profile = () => hermes().profile ?? undefined
  const save = async () => {
    setBusy(true)
    try {
      await rest().put('/api/env', { key: name, value, profile: profile() })
      toast(t('Saved {key}', { key: name ?? '' }), 'success')
      setValue('')
      await queryClient.invalidateQueries({ queryKey: ['env'] })
      onClose()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet
      visible={!!name}
      onClose={onClose}
      title={name ?? ''}
      footer={<Button label={t('Save')} onPress={save} loading={busy} disabled={!value} />}
    >
      {spec?.description ? <Text tone="muted">{spec.description}</Text> : null}
      {spec?.tools?.length ? (
        <Text variant="caption" tone="faint">
          {t('Used by: {tools}', { tools: spec.tools.join(', ') })}
        </Text>
      ) : null}
      <TextField
        label={t('Value')}
        value={value}
        onChangeText={setValue}
        secret={spec?.is_password !== false}
        mono
        placeholder={spec?.is_set ? (spec.redacted_value ?? t('set')) : ''}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {spec?.url ? (
          <Button size="sm" variant="ghost" label={t('Get a key')} onPress={() => WebBrowser.openBrowserAsync(spec.url!)} />
        ) : null}
        {spec?.is_set ? (
          <Button
            size="sm"
            variant="secondary"
            icon={Eye}
            label={t('Reveal')}
            onPress={async () => {
              try {
                const res = await rest().post<{ value: string }>('/api/env/reveal', { key: name, profile: profile() })
                setValue(res.value)
              } catch (e) {
                toastError(e)
              }
            }}
          />
        ) : null}
        {spec?.is_set ? (
          <Button
            size="sm"
            variant="dangerGhost"
            icon={Trash2}
            label={t('Remove')}
            onPress={async () => {
              if (!(await confirm(t('Remove {key}?', { key: name ?? '' }), undefined, { destructive: true, confirmLabel: t('Remove') })))
                return
              try {
                await rest().del('/api/env', { key: name, profile: profile() })
                await queryClient.invalidateQueries({ queryKey: ['env'] })
                onClose()
              } catch (e) {
                toastError(e)
              }
            }}
          />
        ) : null}
      </View>
    </Sheet>
  )
}

function OAuthAccounts() {
  const t = useT()
  const { c } = useTheme()
  const q = useRest<{ providers: OAuthProvider[] }>(['oauth'], '/api/providers/oauth')
  const [flow, setFlow] = useState<{
    provider: OAuthProvider
    session_id: string
    user_code?: string
    verification_url?: string
    auth_url?: string
  } | null>(null)
  const [code, setCode] = useState('')

  async function login(p: OAuthProvider) {
    if (p.flow === 'external') {
      await prompt(t('Run this on the backend'), { initial: p.cli_command })
      return
    }
    try {
      const start = await rest().post<{
        session_id: string
        flow: string
        user_code?: string
        verification_url?: string
        auth_url?: string
        poll_interval?: number
      }>(`/api/providers/oauth/${encodeURIComponent(p.id)}/start`, {})
      setFlow({ provider: p, ...start })
      if (start.flow === 'device_code') {
        if (start.user_code) await Clipboard.setStringAsync(start.user_code)
        void WebBrowser.openBrowserAsync(start.verification_url!)
        for (let i = 0; i < 120; i++) {
          await sleep((start.poll_interval ?? 5) * 1000)
          const st = await rest().get<{ status: string; error_message?: string }>(
            `/api/providers/oauth/${encodeURIComponent(p.id)}/poll/${encodeURIComponent(start.session_id)}`,
          )
          if (st.status === 'approved') {
            toast(t('Signed in to {name}', { name: p.name }), 'success')
            setFlow(null)
            void queryClient.invalidateQueries({ queryKey: ['oauth'] })
            return
          }
          if (st.status !== 'pending') throw new Error(st.error_message || st.status)
        }
      } else {
        void WebBrowser.openBrowserAsync(start.auth_url!)
      }
    } catch (e) {
      toastError(e)
      setFlow(null)
    }
  }

  async function submitCode() {
    if (!flow) return
    try {
      const res = await rest().post<{ ok: boolean; message?: string }>(
        `/api/providers/oauth/${encodeURIComponent(flow.provider.id)}/submit`,
        { session_id: flow.session_id, code: code.trim() },
      )
      if (!res.ok) throw new Error(res.message || t('Sign-in failed'))
      toast(t('Signed in to {name}', { name: flow.provider.name }), 'success')
      setFlow(null)
      setCode('')
      void queryClient.invalidateQueries({ queryKey: ['oauth'] })
    } catch (e) {
      toastError(e)
    }
  }

  return (
    <>
      <Text tone="muted" variant="small">
        {t('Subscriptions you can sign in to instead of pasting API keys.')}
      </Text>
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
      <Section>
        {(q.data?.providers ?? []).map((p, i, all) => (
          <Row
            key={p.id}
            icon={p.status.logged_in ? LogOut : LogIn}
            title={p.name}
            subtitle={
              p.status.logged_in
                ? [p.status.source_label, p.status.token_preview].filter(Boolean).join(' · ')
                : p.status.error || p.flow.replace('_', ' ')
            }
            right={
              p.status.logged_in ? (
                <Button
                  size="sm"
                  variant="dangerGhost"
                  label={t('Sign out')}
                  onPress={async () => {
                    if (!(await confirm(t('Sign out of {name}?', { name: p.name })))) return
                    try {
                      await rest().del(`/api/providers/oauth/${encodeURIComponent(p.id)}`)
                      void q.refetch()
                    } catch (e) {
                      toastError(e)
                    }
                  }}
                />
              ) : (
                <Button size="sm" variant="secondary" label={t('Sign in')} onPress={() => login(p)} />
              )
            }
            last={i === all.length - 1}
          />
        ))}
      </Section>
      <Sheet
        visible={!!flow}
        onClose={() => {
          if (flow)
            void rest()
              .del(`/api/providers/oauth/sessions/${encodeURIComponent(flow.session_id)}`)
              .catch(() => {})
          setFlow(null)
        }}
        title={flow?.provider.name}
      >
        {flow?.user_code ? (
          <>
            <Text tone="muted">{t('Enter this code on the page that opened (it is copied to your clipboard):')}</Text>
            <Text variant="h1" mono center style={{ color: c.accentText }} selectable>
              {flow.user_code}
            </Text>
            <Button
              variant="secondary"
              label={t('Open the page again')}
              onPress={() => WebBrowser.openBrowserAsync(flow.verification_url!)}
            />
            <Loading label={t('Waiting for approval…')} />
          </>
        ) : (
          <>
            <Text tone="muted">{t('Approve in the browser, then paste the code it shows you.')}</Text>
            <TextField label={t('Authorization code')} value={code} onChangeText={setCode} mono autoCapitalize="none" />
            <Button label={t('Finish sign-in')} onPress={submitCode} disabled={!code.trim()} />
          </>
        )}
      </Sheet>
    </>
  )
}

function Pools() {
  const t = useT()
  const q = useRest<{ providers: PoolProvider[] }>(['pools'], '/api/credentials/pool')
  const add = async () => {
    const provider = await prompt(t('Provider'), { placeholder: 'openrouter' })
    if (!provider) return
    const apiKey = await prompt(t('API key for {p}', { p: provider }), { secret: true })
    if (!apiKey) return
    const label = await prompt(t('Label (optional)'), { placeholder: t('work key') })
    try {
      await rest().post('/api/credentials/pool', { provider, api_key: apiKey, label: label || undefined })
      toast(t('Key added'), 'success')
      void q.refetch()
    } catch (e) {
      toastError(e)
    }
  }
  return (
    <>
      <Text tone="muted" variant="small">
        {t('Several keys for one provider rotate automatically when one hits a rate limit.')}
      </Text>
      {q.isLoading ? <Loading /> : null}
      {(q.data?.providers ?? []).map((p) => (
        <Section key={p.provider} title={p.provider}>
          {p.entries.map((e, i) => (
            <Row
              key={e.id}
              title={e.label || e.token_preview}
              subtitle={[e.token_preview, e.source, e.last_status, e.request_count ? t('{n} requests', { n: e.request_count }) : null]
                .filter(Boolean)
                .join(' · ')}
              right={
                <Button
                  size="sm"
                  variant="dangerGhost"
                  label={t('Remove')}
                  onPress={async () => {
                    if (!(await confirm(t('Remove this key from the pool?'), undefined, { destructive: true, confirmLabel: t('Remove') })))
                      return
                    try {
                      await rest().del(`/api/credentials/pool/${encodeURIComponent(p.provider)}/${e.index}`)
                      void q.refetch()
                    } catch (err) {
                      toastError(err)
                    }
                  }}
                />
              }
              last={i === p.entries.length - 1}
            />
          ))}
        </Section>
      ))}
      <Button icon={Plus} variant="secondary" label={t('Add a key to a pool')} onPress={add} />
    </>
  )
}
