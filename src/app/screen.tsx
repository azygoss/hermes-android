import { Image } from 'expo-image'
import { Stack } from 'expo-router'
import { MonitorPlay, Play, Square } from '@/components/icons'
import { useState } from 'react'
import { View } from 'react-native'

import { Badge, Button, Card, EmptyState, ErrorState, KeyValue, Loading, Screen, Text, toast, toastError } from '@/components/ui'
import { useT } from '@/i18n'
import { useRpc } from '@/lib/hooks'
import { rpc, useProfile } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { radius, space, useTheme } from '@/theme'

/** Bot Screen: the virtual desktop (Xvnc + Xfce) the agent drives for computer use. */
export default function BotScreen() {
  const t = useT()
  const { c } = useTheme()
  const profile = useProfile()
  const status = useRpc(['display', 'status', profile], 'display.status', { profile }, { refetchInterval: 5000 })
  const running = !!status.data?.running
  const thumb = useRpc(
    ['display', 'thumb', profile],
    'display.thumbnail',
    { profile },
    { enabled: running, refetchInterval: running ? 2000 : false },
  )
  const [busy, setBusy] = useState<string | null>(null)

  const act = (key: string, fn: () => Promise<unknown>) => async () => {
    setBusy(key)
    try {
      await fn()
      await queryClient.invalidateQueries({ queryKey: ['display'] })
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(null)
    }
  }

  const s = status.data
  return (
    <Screen refreshing={status.isRefetching} onRefresh={() => status.refetch()}>
      <Stack.Screen options={{ title: t('Bot screen') }} />
      <Text tone="muted" variant="small">
        {t('A virtual desktop on the backend that the agent uses for computer-use tasks. Watch it live here.')}
      </Text>
      {status.isLoading ? <Loading /> : null}
      {status.error ? <ErrorState error={status.error} onRetry={() => status.refetch()} /> : null}
      {s && !s.supported ? (
        <EmptyState icon={MonitorPlay} title={t('Not supported on this backend')} body={s.blocker ?? undefined} />
      ) : null}
      {s?.supported ? (
        <>
          <View
            style={{
              aspectRatio: 16 / 10,
              borderRadius: radius.lg,
              overflow: 'hidden',
              backgroundColor: c.codeBg,
              borderWidth: 1,
              borderColor: c.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {running && thumb.data?.data_url ? (
              <Image
                source={{ uri: thumb.data.data_url }}
                style={{ width: '100%', height: '100%' }}
                contentFit="contain"
                transition={0}
                accessibilityLabel={t('Live view of the bot screen')}
              />
            ) : (
              <MonitorPlay size={40} color={c.textFaint} />
            )}
          </View>
          {thumb.data?.suppressed ? (
            <Text variant="caption" tone="faint">
              {thumb.data.suppressed}
            </Text>
          ) : null}
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Text weight="semibold" style={{ flex: 1 }}>
                {running ? t('Running') : s.installed ? t('Stopped') : t('Not installed')}
              </Text>
              <Badge label={s.geometry} />
            </View>
            {s.missing.length ? <KeyValue label={t('Missing packages')} value={s.missing.join(', ')} /> : null}
            {s.browser ? <KeyValue label={t('Browser')} value={s.browser} /> : null}
            {s.memory_available_mb ? <KeyValue label={t('Memory available')} value={`${s.memory_available_mb} MB`} /> : null}
            <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
              {!s.installed ? (
                <Button
                  label={t('Install')}
                  loading={busy === 'install'}
                  onPress={act('install', async () => {
                    const r = await rpc().request('display.install', { profile })
                    toast(
                      r.started ? t('Installing on the backend… this takes a few minutes') : (r.command ?? t('Install could not start')),
                      r.started ? 'success' : 'warn',
                    )
                  })}
                />
              ) : running ? (
                <Button
                  icon={Square}
                  variant="secondary"
                  label={t('Stop')}
                  loading={busy === 'stop'}
                  onPress={act('stop', () => rpc().request('display.stop', { profile, force: true }))}
                />
              ) : (
                <Button
                  icon={Play}
                  label={t('Start')}
                  loading={busy === 'start'}
                  onPress={act('start', () => rpc().request('display.start', { profile }, { timeoutMs: 120_000 }))}
                />
              )}
            </View>
            {s.install_command && !s.installed ? (
              <Text mono variant="caption" selectable>
                {s.install_command}
              </Text>
            ) : null}
          </Card>
        </>
      ) : null}
    </Screen>
  )
}
