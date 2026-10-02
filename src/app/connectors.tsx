import { Stack } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { Link2, Trash2 } from '@/components/icons'
import { useState } from 'react'

import { Badge, Button, confirm, EmptyState, ErrorState, Loading, Row, Screen, Section, Text, toast, toastError } from '@/components/ui'
import { useT } from '@/i18n'
import { useRpc } from '@/lib/hooks'
import { rpc, useProfile } from '@/lib/hermes'
import { queryClient } from '@/lib/query'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Hosted connectors (Gmail, GitHub, Notion…) brokered by Nous Portal. */
export default function ConnectorsScreen() {
  const t = useT()
  const profile = useProfile()
  const catalog = useRpc(['connectors', 'catalog', profile], 'connectors.catalog', { profile })
  const accounts = useRpc(['connectors', 'accounts', profile], 'connectors.accounts', { profile })
  const [busy, setBusy] = useState<string | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['connectors'] })
  const connected = new Map((accounts.data?.accounts ?? []).map((a) => [a.connector, a]))

  async function connect(slug: string) {
    setBusy(slug)
    try {
      const owner = { type: 'account' as const }
      let op = await rpc().request('connectors.connect', { owner, connectors: [slug], profile })
      const url = op.targets.find((x) => x.connect_url)?.connect_url
      if (url) await WebBrowser.openBrowserAsync(url)
      for (let i = 0; i < 60 && !op.settled; i++) {
        await sleep(2000)
        await rpc()
          .request('connectors.operation.wake', { owner, op_id: op.op_id, profile })
          .catch(() => {})
        op = { ...op, ...(await rpc().request('connectors.operation.status', { owner, op_id: op.op_id, profile })) }
        if (op.targets.every((x) => x.state === 'connected' || x.state === 'failed' || x.state === 'skipped')) break
      }
      const state = op.targets[0]?.state
      toast(
        state === 'connected' ? t('{name} connected', { name: slug }) : t('Connection {state}', { state: state ?? '?' }),
        state === 'connected' ? 'success' : 'warn',
      )
      await refresh()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(null)
    }
  }

  // Without a Nous Portal sign-in the backend answers "not available"; the empty state explains that.
  const error = [catalog.error, accounts.error].find((e) => e && !/not available/i.test(String((e as Error).message ?? e)))
  return (
    <Screen refreshing={catalog.isRefetching} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('Connectors') }} />
      <Text tone="muted" variant="small">
        {t('Sign in once and Hermes can use these apps through Nous Portal, without storing their tokens on your server.')}
      </Text>
      {catalog.isLoading ? <Loading /> : null}
      {error ? <ErrorState error={error} onRetry={refresh} /> : null}
      {accounts.data?.accounts.length ? (
        <Section title={t('Connected accounts')}>
          {accounts.data.accounts.map((a, i, all) => (
            <Row
              key={a.connection_id}
              icon={Link2}
              title={a.alias || a.label}
              subtitle={a.connector}
              right={
                <Button
                  size="sm"
                  variant="dangerGhost"
                  icon={Trash2}
                  label={t('Remove')}
                  onPress={async () => {
                    if (
                      !(await confirm(t('Disconnect {name}?', { name: a.label }), undefined, {
                        destructive: true,
                        confirmLabel: t('Disconnect'),
                      }))
                    )
                      return
                    await rpc().request('connectors.accounts.remove', { connection_id: a.connection_id, profile }).catch(toastError)
                    await refresh()
                  }}
                />
              }
              last={i === all.length - 1}
            />
          ))}
        </Section>
      ) : null}
      <Section title={t('Available')}>
        {(catalog.data?.connectors ?? []).map((cn, i, all) => {
          const acc = connected.get(cn.slug)
          return (
            <Row
              key={cn.slug}
              title={cn.name}
              subtitle={`${cn.category} · ${cn.description}`}
              numberOfLines={2}
              right={
                acc ? (
                  <Badge label={acc.status} tone={acc.status === 'active' ? 'success' : 'warn'} />
                ) : (
                  <Button size="sm" label={t('Connect')} loading={busy === cn.slug} onPress={() => connect(cn.slug)} />
                )
              }
              last={i === all.length - 1}
            />
          )
        })}
        {!catalog.isLoading && !catalog.data?.connectors.length ? (
          <EmptyState icon={Link2} title={t('No connectors available')} body={t('Connectors need a Nous Portal sign-in.')} />
        ) : null}
      </Section>
    </Screen>
  )
}
