import { Stack } from 'expo-router'
import { UserCheck, UserX } from 'lucide-react-native'

import { Badge, Button, confirm, EmptyState, ErrorState, Loading, Row, Screen, Section, Text, toast, toastError } from '@/components/ui'
import { useT } from '@/i18n'
import { useRest } from '@/lib/hooks'
import { hermes, rest } from '@/lib/hermes'
import { queryClient } from '@/lib/query'

interface PairingUser {
  platform: string
  user_id: string
  user_name?: string
  request_id?: string
  age_minutes?: number
}

export default function PairingScreen() {
  const t = useT()
  const q = useRest<{ pending: PairingUser[]; approved: PairingUser[] }>(['pairing'], '/api/pairing', undefined, {
    refetchInterval: 15_000,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['pairing'] })
  const act = (fn: () => Promise<unknown>, done: string) => async () => {
    try {
      await fn()
      toast(done, 'success')
      await refresh()
    } catch (e) {
      toastError(e)
    }
  }
  const profile = () => hermes().profile ?? undefined

  return (
    <Screen refreshing={q.isRefetching} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('Pairing requests') }} />
      <Text tone="muted" variant="small">
        {t('When someone not on the allowlist messages your bot, they get a pairing code. Approve them here to let them talk to Hermes.')}
      </Text>
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
      <Section
        title={t('Waiting for approval')}
        action={
          q.data?.pending.length ? (
            <Button
              size="sm"
              variant="ghost"
              label={t('Clear all')}
              onPress={act(() => rest().post('/api/pairing/clear-pending'), t('Cleared'))}
            />
          ) : undefined
        }
      >
        {q.data?.pending.length ? (
          q.data.pending.map((u, i, all) => (
            <Row
              key={`${u.platform}-${u.user_id}`}
              icon={UserCheck}
              title={u.user_name || u.user_id}
              subtitle={`${u.platform} · ${u.user_id}${u.age_minutes != null ? ` · ${t('{n} min ago', { n: Math.round(u.age_minutes) })}` : ''}`}
              right={
                <Button
                  size="sm"
                  label={t('Approve')}
                  onPress={act(
                    () => rest().post('/api/pairing/approve', { platform: u.platform, request_id: u.request_id, profile: profile() }),
                    t('Approved'),
                  )}
                />
              }
              last={i === all.length - 1}
            />
          ))
        ) : (
          <EmptyState icon={UserCheck} title={t('No pending requests')} />
        )}
      </Section>
      <Section title={t('Approved people')}>
        {(q.data?.approved ?? []).map((u, i, all) => (
          <Row
            key={`${u.platform}-${u.user_id}`}
            icon={UserX}
            title={u.user_name || u.user_id}
            subtitle={u.platform}
            right={
              <Button
                size="sm"
                variant="dangerGhost"
                label={t('Revoke')}
                onPress={async () => {
                  if (
                    await confirm(t('Revoke access for {name}?', { name: u.user_name || u.user_id }), undefined, {
                      destructive: true,
                      confirmLabel: t('Revoke'),
                    })
                  )
                    await act(
                      () => rest().post('/api/pairing/revoke', { platform: u.platform, user_id: u.user_id, profile: profile() }),
                      t('Revoked'),
                    )()
                }}
              />
            }
            last={i === all.length - 1}
          />
        ))}
        {!q.data?.approved.length ? <Badge label={t('nobody yet')} /> : null}
      </Section>
    </Screen>
  )
}
