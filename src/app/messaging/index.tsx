import { router, Stack } from 'expo-router'
import { Play, RotateCw, Square } from 'lucide-react-native'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { Button, Card, ErrorState, Loading, Row, Screen, Section, Text, toast, toastError } from '@/components/ui'
import { useT } from '@/i18n'
import { useRest } from '@/lib/hooks'
import { rest } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { space, useTheme } from '@/theme'
import type { Platform } from '@/components/messaging/types'

export default function MessagingScreen() {
  const t = useT()
  const { c } = useTheme()
  const q = useRest<{ platforms: Platform[]; gateway_start_command?: string }>(['messaging'], '/api/messaging/platforms')
  const status = useRest<{ gateway_running?: boolean; gateway_state?: string; gateway_exit_reason?: string | null }>(
    ['status'],
    '/api/status',
  )
  const [busy, setBusy] = useState<string | null>(null)
  const running = !!status.data?.gateway_running

  const gw = (action: 'start' | 'stop' | 'restart') => async () => {
    setBusy(action)
    try {
      const res = await rest().post<{ ok?: boolean; error?: string; message?: string }>(`/api/gateway/${action}`, undefined, {
        noProfile: true,
        timeoutMs: 120_000,
      })
      if (res?.ok === false) throw new Error(res.error || res.message)
      toast(t('Gateway {action} requested', { action }), 'success')
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['status'] }), 2500)
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['messaging'] }), 4000)
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(null)
    }
  }

  const platforms = [...(q.data?.platforms ?? [])].sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name))
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => (q.refetch(), status.refetch())}>
      <Stack.Screen options={{ title: t('Messaging platforms') }} />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={[styles.dot, { backgroundColor: running ? c.success : c.textFaint }]} />
          <Text weight="semibold" style={{ flex: 1 }}>
            {running ? t('Messaging gateway is running') : t('Messaging gateway is stopped')}
          </Text>
        </View>
        {status.data?.gateway_exit_reason && !running ? (
          <Text variant="small" tone="muted">
            {status.data.gateway_exit_reason}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          {running ? (
            <>
              <Button size="sm" icon={RotateCw} label={t('Restart')} loading={busy === 'restart'} onPress={gw('restart')} />
              <Button size="sm" variant="secondary" icon={Square} label={t('Stop')} loading={busy === 'stop'} onPress={gw('stop')} />
            </>
          ) : (
            <Button size="sm" icon={Play} label={t('Start gateway')} loading={busy === 'start'} onPress={gw('start')} />
          )}
        </View>
        <Text variant="caption" tone="faint">
          {t('The gateway connects Hermes to the platforms below. Credential changes need a restart unless noted.')}
        </Text>
      </Card>
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
      {[
        { title: t('Set up'), items: platforms.filter((p) => p.enabled) },
        { title: t('Available'), items: platforms.filter((p) => !p.enabled) },
      ]
        .filter((g) => g.items.length)
        .map((g) => (
          <Section key={g.title} title={g.title}>
            {g.items.map((p, i) => (
              <Row
                key={p.id}
                title={p.name}
                value={p.enabled ? p.state.replace(/_/g, ' ') : null}
                onPress={() => router.push({ pathname: '/messaging/[id]', params: { id: p.id } })}
                last={i === g.items.length - 1}
              />
            ))}
          </Section>
        ))}
    </Screen>
  )
}

const styles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5 },
})
