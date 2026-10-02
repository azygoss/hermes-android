import * as Crypto from 'expo-crypto'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { CheckCircle2, KeyRound, Lock, QrCode, Server, ShieldCheck, Trash2, Wifi } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { reconnectActive } from '@/components/GatewayBridge'
import { HermesMark } from '@/components/HermesMark'
import { QrScanner } from '@/components/QrScanner'
import { Badge, Button, Card, confirm, ErrorState, Row, Screen, Section, Segmented, Text, TextField, toast } from '@/components/ui'
import { useT } from '@/i18n'
import { parseConnectLink } from '@/lib/links'
import { detectToken, normalizeBaseUrl, passwordLogin, probe, verifyToken, type ProbeResult } from '@/lib/auth'
import { connectionSecrets, useConnections, type Connection } from '@/store/connections'
import { space, useTheme } from '@/theme'

function parseHeaders(text: string): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return Object.keys(out).length ? out : undefined
}

export default function ConnectScreen() {
  const t = useT()
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ url?: string; token?: string; name?: string; edit?: string }>()
  const { connections, activeId, upsert, setActive, remove } = useConnections()
  const editing = connections.find((x) => x.id === params.edit)

  const [name, setName] = useState(editing?.name ?? params.name ?? '')
  const [url, setUrl] = useState(editing?.baseUrl ?? params.url ?? '')
  const [token, setToken] = useState(params.token ?? '')
  const [username, setUsername] = useState(editing?.username ?? '')
  const [password, setPassword] = useState('')
  const [provider, setProvider] = useState(editing?.provider ?? 'basic')
  const [headersText, setHeadersText] = useState(
    editing?.headers
      ? Object.entries(editing.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n')
      : '',
  )
  const [showAdvanced, setShowAdvanced] = useState(!!editing?.headers)
  const [probed, setProbed] = useState<ProbeResult | null>(null)
  const [busy, setBusy] = useState<null | 'probe' | 'save' | 'detect'>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)

  const baseUrl = normalizeBaseUrl(url)
  const headers = parseHeaders(headersText)

  useEffect(() => {
    setProbed(null)
    setError(null)
  }, [url])

  useEffect(() => {
    if (params.url && !probed) void runProbe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.url])

  async function runProbe() {
    if (!baseUrl) {
      setError(t('Enter the address of your Hermes backend.'))
      return
    }
    setBusy('probe')
    setError(null)
    const r = await probe(baseUrl, headers)
    setBusy(null)
    setProbed(r)
    if (!r.reachable) setError(r.error ?? t('Hermes did not answer.'))
    else if (r.authRequired && r.providers[0] && !r.providers.some((p) => p.name === provider)) setProvider(r.providers[0].name)
  }

  async function runDetect() {
    setBusy('detect')
    const found = await detectToken(baseUrl)
    setBusy(null)
    if (found) {
      setToken(found)
      toast(t('Session token found.'), 'success')
    } else toast(t('No token found. Start hermes serve with HERMES_DASHBOARD_SESSION_TOKEN set and paste it here.'), 'warn')
  }

  async function save() {
    if (!probed?.reachable) return
    setBusy('save')
    setError(null)
    try {
      const id = editing?.id ?? Crypto.randomUUID()
      const host = baseUrl.replace(/^https?:\/\//, '')
      const conn: Connection = {
        id,
        name: name.trim() || host,
        baseUrl,
        authMode: probed.authRequired ? 'password' : 'token',
        username: probed.authRequired ? username.trim() : undefined,
        provider: probed.authRequired ? provider : undefined,
        headers,
        profile: editing?.profile ?? null,
        lastConnectedAt: editing?.lastConnectedAt,
      }
      if (conn.authMode === 'token') {
        if (!token.trim()) throw new Error(t('Paste the session token, or tap Detect.'))
        if (!(await verifyToken(baseUrl, token.trim(), headers))) {
          throw new Error(
            t(
              'The backend rejected this token. Token mode only works from the same machine or through a tunnel (SSH, adb reverse, Termux).',
            ),
          )
        }
        await connectionSecrets.setToken(id, token.trim())
      } else {
        if (!username.trim() || !password) throw new Error(t('Enter your username and password.'))
        const session = await passwordLogin(baseUrl, provider, username.trim(), password, headers)
        await connectionSecrets.setSession(id, session)
      }
      upsert(conn)
      if (activeId === id) await reconnectActive()
      else setActive(id)
      toast(t('Connected to {name}', { name: conn.name }), 'success')
      router.replace('/chat')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  function onScanned(data: string) {
    setScanning(false)
    const link = parseConnectLink(data)
    if (!link?.url) {
      toast(t('That QR code is not a Hermes connection link.'), 'warn')
      return
    }
    setUrl(link.url)
    if (link.token) setToken(link.token)
    if (link.name) setName(link.name)
    if (link.username) setUsername(link.username)
    setTimeout(() => void runProbeFor(link.url!), 0)
  }

  async function runProbeFor(raw: string) {
    const b = normalizeBaseUrl(raw)
    setBusy('probe')
    const r = await probe(b, headers)
    setBusy(null)
    setProbed(r)
    if (!r.reachable) setError(r.error ?? null)
  }

  const firstRun = !connections.length
  return (
    <Screen style={firstRun ? { paddingTop: insets.top + space.xl } : undefined}>
      <Stack.Screen options={{ headerShown: !firstRun, title: editing ? t('Edit connection') : t('Connect to Hermes') }} />
      {firstRun ? (
        <View style={{ alignItems: 'center', paddingBottom: space.sm }}>
          <HermesMark size={72} />
        </View>
      ) : null}
      {!editing && connections.length > 0 ? (
        <Section title={t('Saved connections')}>
          {connections.map((conn, i) => (
            <Row
              key={conn.id}
              icon={conn.authMode === 'password' ? Lock : KeyRound}
              title={conn.name}
              subtitle={`${conn.baseUrl} · ${conn.authMode === 'password' ? t('password') : t('token')}`}
              right={conn.id === activeId ? <Badge label={t('Active')} tone="accent" /> : undefined}
              onPress={() => {
                setActive(conn.id)
                router.replace('/chat')
              }}
              onLongPress={async () => {
                if (
                  await confirm(t('Remove {name}?', { name: conn.name }), t('The saved credentials are deleted from this phone.'), {
                    destructive: true,
                    confirmLabel: t('Remove'),
                  })
                ) {
                  await remove(conn.id)
                }
              }}
              last={i === connections.length - 1}
            />
          ))}
        </Section>
      ) : null}

      <View style={{ gap: space.xs }}>
        <Text variant="h2">{editing ? t('Edit connection') : connections.length ? t('Add a backend') : t('Connect to your Hermes')}</Text>
        <Text tone="muted">{t('The agent runs on your computer or server with `hermes serve`. This app is a remote control for it.')}</Text>
      </View>

      <Card>
        <TextField
          label={t('Backend address')}
          value={url}
          onChangeText={setUrl}
          placeholder="http://192.168.1.20:9119"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          mono
          returnKeyType="go"
          onSubmitEditing={runProbe}
          helper={t('Default port is 9119. Use https:// behind a reverse proxy.')}
        />
        <TextField label={t('Name (optional)')} value={name} onChangeText={setName} placeholder={t('Home server')} />
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          <Button label={t('Check connection')} icon={Wifi} onPress={runProbe} loading={busy === 'probe'} />
          <Button label={t('Scan QR')} icon={QrCode} variant="secondary" onPress={() => setScanning(true)} />
        </View>
        <Button
          label={showAdvanced ? t('Hide advanced options') : t('Advanced options')}
          variant="ghost"
          size="sm"
          onPress={() => setShowAdvanced(!showAdvanced)}
          style={{ alignSelf: 'flex-start' }}
        />
        {showAdvanced ? (
          <TextField
            label={t('Extra headers')}
            value={headersText}
            onChangeText={setHeadersText}
            placeholder={'CF-Access-Client-Id: …\nCF-Access-Client-Secret: …'}
            multiline
            mono
            helper={t('One "Name: value" per line, sent with every request. For access proxies such as Cloudflare Access.')}
          />
        ) : null}
      </Card>

      {error ? <ErrorState error={error} /> : null}

      {probed?.reachable ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <CheckCircle2 size={20} color={c.success} />
            <Text weight="semibold" style={{ flex: 1 }}>
              {t('Hermes {version} is reachable', { version: probed.displayVersion ?? probed.version ?? '' })}
            </Text>
            <Badge label={probed.authRequired ? t('Password login') : t('Token')} tone={probed.authRequired ? 'info' : 'accent'} />
          </View>
          {probed.authRequired ? (
            <>
              {probed.providers.length > 1 ? (
                <Segmented
                  options={probed.providers.map((p) => ({ value: p.name, label: p.display_name }))}
                  value={provider}
                  onChange={setProvider}
                />
              ) : null}
              {probed.providers.find((p) => p.name === provider)?.supports_password === false ? (
                <Text tone="warn" variant="small">
                  {t(
                    'This login provider needs a browser sign-in, which the app does not support yet. Add a username/password (dashboard.basic_auth) to the backend.',
                  )}
                </Text>
              ) : null}
              <TextField label={t('Username')} value={username} onChangeText={setUsername} autoCapitalize="none" autoComplete="username" />
              <TextField
                label={t('Password')}
                value={password}
                onChangeText={setPassword}
                secret
                autoComplete="password"
                onSubmitEditing={save}
              />
            </>
          ) : (
            <>
              <TextField
                label={t('Session token')}
                value={token}
                onChangeText={setToken}
                secret
                mono
                helper={t('The value of HERMES_DASHBOARD_SESSION_TOKEN on the backend.')}
              />
              <Button
                label={t('Detect token')}
                variant="secondary"
                size="sm"
                onPress={runDetect}
                loading={busy === 'detect'}
                style={{ alignSelf: 'flex-start' }}
              />
            </>
          )}
          <Button
            label={editing ? t('Save and reconnect') : t('Connect')}
            icon={ShieldCheck}
            onPress={save}
            loading={busy === 'save'}
            full
          />
        </Card>
      ) : null}

      {editing ? (
        <Button
          label={t('Remove this connection')}
          icon={Trash2}
          variant="dangerGhost"
          onPress={async () => {
            if (await confirm(t('Remove {name}?', { name: editing.name }), undefined, { destructive: true, confirmLabel: t('Remove') })) {
              await remove(editing.id)
              router.replace('/')
            }
          }}
        />
      ) : null}

      <Section title={t('How to start the backend')}>
        <SetupStep
          icon={Server}
          title={t('Same Wi-Fi, Tailscale or the internet')}
          body={t('Add a login to ~/.hermes/config.yaml and listen on all interfaces:')}
          code={
            'dashboard:\n  basic_auth:\n    username: me\n    password: <password>\n    secret: <random string>\n\nhermes serve --host 0.0.0.0'
          }
        />
        <SetupStep
          icon={KeyRound}
          title={t('Through a tunnel or on this phone (Termux)')}
          body={t(
            'Token mode accepts only local connections. Fix the token and forward the port (ssh -L 9119:127.0.0.1:9119 host, or run Hermes in Termux and use http://127.0.0.1:9119):',
          )}
          code={'HERMES_DASHBOARD_SESSION_TOKEN=<secret> hermes serve'}
          last
        />
      </Section>

      <QrScanner visible={scanning} onClose={() => setScanning(false)} onScanned={onScanned} />
    </Screen>
  )
}

function SetupStep({
  icon: Icon,
  title,
  body,
  code,
  last,
}: {
  icon: typeof Server
  title: string
  body: string
  code: string
  last?: boolean
}) {
  const { c } = useTheme()
  return (
    <View style={{ padding: space.lg, gap: space.sm, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border }}>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <Icon size={18} color={c.textMuted} strokeWidth={1.75} />
        <Text weight="semibold">{title}</Text>
      </View>
      <Text tone="muted" variant="small">
        {body}
      </Text>
      <View style={{ backgroundColor: c.codeBg, borderRadius: 8, padding: space.md }}>
        <Text mono variant="small" selectable>
          {code}
        </Text>
      </View>
    </View>
  )
}
