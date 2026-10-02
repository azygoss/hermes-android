import { Stack, useLocalSearchParams } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { BookOpen, Plug, QrCode, Save, Send } from '@/components/icons'
import { useEffect, useRef, useState } from 'react'
import { Linking, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'

import {
  Badge,
  Button,
  Card,
  ErrorState,
  KeyValue,
  Loading,
  Screen,
  Section,
  Sheet,
  Text,
  TextField,
  toast,
  toastError,
  ToggleRow,
} from '@/components/ui'
import { useT } from '@/i18n'
import { useRest } from '@/lib/hooks'
import { rest } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { radius, space, useTheme } from '@/theme'

import { stateTone, type Platform } from '@/components/messaging/types'

export default function PlatformScreen() {
  const t = useT()
  const { id } = useLocalSearchParams<{ id: string }>()
  const q = useRest<{ platforms: Platform[] }>(['messaging'], '/api/messaging/platforms')
  const p = q.data?.platforms.find((x) => x.id === id)
  const [env, setEnv] = useState<Record<string, string>>({})
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [onboard, setOnboard] = useState<'telegram' | 'whatsapp' | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['messaging'] })

  const save = async (patch: { enabled?: boolean; env?: Record<string, string>; clear_env?: string[] }, key = 'save') => {
    setBusy(key)
    try {
      const res = await rest().put<{ hot_served?: boolean }>(`/api/messaging/platforms/${encodeURIComponent(id)}`, patch)
      toast(res?.hot_served ? t('Saved and applied') : t('Saved — restart the gateway to apply'), 'success')
      setEnv({})
      await refresh()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(null)
    }
  }

  const test = async () => {
    setBusy('test')
    try {
      const res = await rest().post<{ ok: boolean; state: string; message: string }>(
        `/api/messaging/platforms/${encodeURIComponent(id)}/test`,
        undefined,
        { timeoutMs: 60_000 },
      )
      toast(res.message || res.state, res.ok ? 'success' : 'warn')
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(null)
    }
  }

  if (!p) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('Platform') }} />
        {q.isLoading ? <Loading /> : <ErrorState error={q.error ?? t('Unknown platform')} />}
      </Screen>
    )
  }
  const vars = p.env_vars.filter((v) => showAdvanced || !v.advanced)
  return (
    <Screen refreshing={q.isRefetching} onRefresh={refresh}>
      <Stack.Screen options={{ title: p.name }} />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text weight="semibold" style={{ flex: 1 }}>
            {p.name}
          </Text>
          <Badge label={p.state.replace(/_/g, ' ')} tone={stateTone(p.state)} />
        </View>
        {p.description ? (
          <Text variant="small" tone="muted">
            {p.description}
          </Text>
        ) : null}
        {p.error_message ? (
          <Text variant="small" tone="danger">
            {p.error_message}
          </Text>
        ) : null}
        {p.home_channel ? <KeyValue label={t('Home channel')} value={p.home_channel.name || p.home_channel.chat_id} /> : null}
      </Card>

      <Section>
        <ToggleRow icon={Plug} title={t('Enabled')} value={p.enabled} onChange={(v) => save({ enabled: v }, 'enable')} last />
      </Section>

      {id === 'telegram' || id === 'whatsapp' ? (
        <Button
          icon={QrCode}
          variant="secondary"
          label={id === 'telegram' ? t('Guided setup: create a bot') : t('Guided setup: link WhatsApp')}
          onPress={() => setOnboard(id)}
        />
      ) : null}

      <Section title={t('Credentials')} footer={t('Stored in the backend .env. Leave a set field empty to keep it.')}>
        <View style={{ padding: space.lg, gap: space.md }}>
          {vars.map((v) => (
            <View key={v.key} style={{ gap: 4 }}>
              <TextField
                label={`${v.prompt || v.key}${v.required ? ' *' : ''}`}
                value={env[v.key] ?? ''}
                onChangeText={(x) => setEnv((cur) => ({ ...cur, [v.key]: x }))}
                placeholder={v.is_set ? (v.redacted_value ?? t('set')) : v.key}
                secret={v.is_password}
                helper={v.description}
                autoCapitalize="none"
                mono={v.is_password}
              />
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {v.url ? (
                  <Button size="sm" variant="ghost" label={t('Where do I get this?')} onPress={() => WebBrowser.openBrowserAsync(v.url!)} />
                ) : null}
                {v.is_set ? (
                  <Button
                    size="sm"
                    variant="dangerGhost"
                    label={t('Clear')}
                    onPress={() => save({ clear_env: [v.key] }, `clear-${v.key}`)}
                  />
                ) : null}
              </View>
            </View>
          ))}
          {p.env_vars.some((v) => v.advanced) ? (
            <Button
              size="sm"
              variant="ghost"
              label={showAdvanced ? t('Hide advanced') : t('Show advanced')}
              onPress={() => setShowAdvanced(!showAdvanced)}
              style={{ alignSelf: 'flex-start' }}
            />
          ) : null}
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button
              icon={Save}
              label={t('Save')}
              onPress={() => save({ env: Object.fromEntries(Object.entries(env).filter(([, v]) => v)) })}
              loading={busy === 'save'}
              disabled={!Object.values(env).some(Boolean)}
            />
            <Button icon={Send} variant="secondary" label={t('Test')} onPress={test} loading={busy === 'test'} />
          </View>
        </View>
      </Section>
      {p.docs_url ? (
        <Button variant="ghost" icon={BookOpen} label={t('Setup guide')} onPress={() => WebBrowser.openBrowserAsync(p.docs_url!)} />
      ) : null}
      <OnboardingSheet kind={onboard} onClose={() => setOnboard(null)} onDone={refresh} />
    </Screen>
  )
}

function OnboardingSheet({ kind, onClose, onDone }: { kind: 'telegram' | 'whatsapp' | null; onClose: () => void; onDone: () => void }) {
  const t = useT()
  const { c } = useTheme()
  const [state, setState] = useState<{
    pairing_id?: string
    deep_link?: string
    qr_payload?: string | null
    status?: string
    bot_username?: string
    owner_user_id?: string
    error?: string | null
  } | null>(null)
  const [allowed, setAllowed] = useState('')
  const [mode, setMode] = useState<'bot' | 'self-chat'>('self-chat')
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const base = `/api/messaging/${kind}/onboarding`

  useEffect(() => {
    if (!kind) return
    let cancelled = false
    setState(null)
    ;(async () => {
      try {
        const start = await rest().post(`${base}/start`, kind === 'telegram' ? {} : { mode }, { timeoutMs: 120_000 })
        if (cancelled) return
        setState(start)
        timer.current = setInterval(async () => {
          try {
            const st = await rest().get(`${base}/${encodeURIComponent(start.pairing_id)}`)
            setState((cur) => ({ ...cur, ...st }))
            if (st.owner_user_id) setAllowed((a) => a || String(st.owner_user_id))
            if (['ready', 'connected', 'error', 'expired'].includes(st.status)) clearInterval(timer.current!)
          } catch {
            // keep polling
          }
        }, 2500)
      } catch (e) {
        toastError(e)
      }
    })()
    return () => {
      cancelled = true
      if (timer.current) clearInterval(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])

  const close = async () => {
    if (timer.current) clearInterval(timer.current)
    if (state?.pairing_id && !['ready', 'connected'].includes(state.status ?? ''))
      await rest()
        .del(`${base}/${encodeURIComponent(state.pairing_id)}`)
        .catch(() => {})
    onClose()
  }

  const apply = async () => {
    if (!state?.pairing_id) return
    setBusy(true)
    try {
      const body = kind === 'telegram' ? { allowed_user_ids: allowed.split(/[,\s]+/).filter(Boolean) } : { mode, allowed_users: allowed }
      const res = await rest().post<{ ok: boolean; needs_restart?: boolean; restart_started?: boolean; restart_error?: string }>(
        `${base}/${encodeURIComponent(state.pairing_id)}/apply`,
        body,
        { timeoutMs: 120_000 },
      )
      toast(
        res.restart_error
          ? res.restart_error
          : res.needs_restart && !res.restart_started
            ? t('Done — restart the gateway')
            : t('Connected!'),
        res.restart_error ? 'warn' : 'success',
      )
      onDone()
      onClose()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }

  const ready = state?.status === 'ready' || state?.status === 'connected'
  return (
    <Sheet visible={!!kind} onClose={close} title={kind === 'telegram' ? t('Create a Telegram bot') : t('Link WhatsApp')}>
      {!state ? <Loading /> : null}
      {kind === 'telegram' && state?.deep_link ? (
        <>
          <Text tone="muted">{t('Tap the button, then press Start in Telegram. BotFather creates the bot and hands it to Hermes.')}</Text>
          <Button icon={Send} label={t('Open Telegram')} onPress={() => Linking.openURL(state.deep_link!)} />
        </>
      ) : null}
      {kind === 'whatsapp' && state?.qr_payload && !ready ? (
        <>
          <Text tone="muted">{t('On the phone with WhatsApp: Settings → Linked devices → Link a device, and scan this code.')}</Text>
          <View style={{ alignSelf: 'center', padding: space.md, backgroundColor: '#fff', borderRadius: radius.md }}>
            <QRCode value={state.qr_payload} size={220} />
          </View>
        </>
      ) : null}
      {state?.status ? <Badge label={state.status} tone={ready ? 'success' : state.status === 'error' ? 'danger' : 'info'} /> : null}
      {state?.error ? <Text tone="danger">{state.error}</Text> : null}
      {ready ? (
        <>
          {state?.bot_username ? <Text weight="semibold">@{state.bot_username}</Text> : null}
          <TextField
            label={kind === 'telegram' ? t('Allowed Telegram user IDs') : t('Allowed numbers (optional)')}
            value={allowed}
            onChangeText={setAllowed}
            helper={t('Only these people can talk to Hermes. Others can ask through pairing.')}
            autoCapitalize="none"
          />
          <Button label={t('Finish setup')} onPress={apply} loading={busy} />
        </>
      ) : state ? (
        <Text variant="small" tone="faint" style={{ color: c.textFaint }}>
          {t('Waiting…')}
        </Text>
      ) : null}
      {kind === 'whatsapp' && !state?.qr_payload && !ready ? (
        <ToggleRow
          title={t('Use my own number (self-chat)')}
          value={mode === 'self-chat'}
          onChange={(v) => setMode(v ? 'self-chat' : 'bot')}
        />
      ) : null}
    </Sheet>
  )
}
