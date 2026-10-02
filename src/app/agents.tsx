import { router, Stack } from 'expo-router'
import { Activity, Pause, Play, SquareTerminal, Users } from 'lucide-react-native'
import { View } from 'react-native'

import { Badge, Button, Card, EmptyState, Loading, Row, Screen, Section, Text, toastError } from '@/components/ui'
import { useT } from '@/i18n'
import { useRest, useRpc } from '@/lib/hooks'
import { rpc } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { useChat } from '@/store/chat'
import { space } from '@/theme'

function uptime(s: number) {
  if (s < 60) return `${Math.round(s)}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  return `${(s / 3600).toFixed(1)}h`
}

/** Everything running on the backend right now: processes, delegated subagents, live chats and kanban workers. */
export default function AgentsScreen() {
  const t = useT()
  const procs = useRpc(['agents.list'], 'agents.list', {}, { refetchInterval: 4000 })
  const delegation = useRpc(['delegation.status'], 'delegation.status', {}, { refetchInterval: 4000 })
  const live = useRpc(['session.active_list'], 'session.active_list', {}, { refetchInterval: 5000 })
  const workers = useRest<{ workers?: { task_id?: string; assignee?: string; pid?: number; title?: string; started_at?: number }[] }>(
    ['kanban', 'workers'],
    '/api/plugins/kanban/workers/active',
    undefined,
    { refetchInterval: 8000 },
  )
  const openChats = useChat((s) => Object.keys(s.sessions).length)

  const sessions = live.data?.sessions ?? []

  return (
    <Screen refreshing={procs.isRefetching} onRefresh={() => queryClient.invalidateQueries()}>
      <Stack.Screen options={{ title: t('Background agents') }} />
      {procs.isLoading ? <Loading /> : null}
      <Section title={t('Live chats on the backend')} footer={t('{n} of them are open in this app.', { n: openChats })}>
        {sessions.length ? (
          sessions.map((s, i) => (
            <Row
              key={s.id}
              icon={Activity}
              title={s.title || s.preview || s.id}
              subtitle={[s.model, s.session_key].filter(Boolean).join(' · ')}
              onPress={() => router.navigate({ pathname: '/chat', params: { stored: s.session_key || s.id } })}
              right={<Badge label={s.status ?? '?'} tone={s.status === 'working' || s.status === 'streaming' ? 'accent' : 'default'} />}
              last={i === sessions.length - 1}
            />
          ))
        ) : (
          <View style={{ padding: space.lg }}>
            <Text tone="muted">{t('No live chats.')}</Text>
          </View>
        )}
      </Section>

      {delegation.data ? (
        <Section
          title={t('Subagents ({n})', { n: delegation.data.active.length })}
          action={
            <Button
              size="sm"
              variant="ghost"
              icon={delegation.data.paused ? Play : Pause}
              label={delegation.data.paused ? t('Resume spawning') : t('Pause spawning')}
              onPress={async () => {
                await rpc().request('delegation.pause', { paused: !delegation.data!.paused }).catch(toastError)
                void delegation.refetch()
              }}
            />
          }
        >
          {delegation.data.active.length ? (
            delegation.data.active.map((a, i) => (
              <Row
                key={a.subagent_id}
                icon={Users}
                title={a.goal || a.subagent_id}
                subtitle={[
                  a.model,
                  a.tool_count != null ? t('{n} tools', { n: a.tool_count }) : null,
                  a.depth != null ? t('depth {d}', { d: a.depth }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                right={<Badge label={a.status ?? 'running'} tone="accent" />}
                last={i === delegation.data!.active.length - 1}
              />
            ))
          ) : (
            <View style={{ padding: space.lg }}>
              <Text tone="muted">{t('No subagents running.')}</Text>
            </View>
          )}
        </Section>
      ) : null}

      <Section title={t('Background processes')}>
        {(procs.data?.processes ?? []).length ? (
          (procs.data?.processes ?? []).map((p, i, all) => (
            <Row
              key={`${p.session_id}-${i}`}
              icon={SquareTerminal}
              title={p.command}
              mono
              subtitle={uptime(p.uptime)}
              right={<Badge label={p.status} tone={p.status === 'running' ? 'accent' : 'default'} />}
              last={i === all.length - 1}
            />
          ))
        ) : (
          <View style={{ padding: space.lg }}>
            <Text tone="muted">{t('No background processes.')}</Text>
          </View>
        )}
      </Section>

      {workers.data?.workers?.length ? (
        <Section title={t('Kanban workers')}>
          {workers.data.workers.map((w, i, all) => (
            <Row
              key={`${w.task_id}-${i}`}
              icon={Users}
              title={w.title || w.task_id || '?'}
              subtitle={w.assignee}
              last={i === all.length - 1}
            />
          ))}
        </Section>
      ) : null}

      {!procs.isLoading && !sessions.length && !delegation.data?.active.length && !procs.data?.processes?.length ? (
        <Card>
          <EmptyState icon={Activity} title={t('All quiet')} body={t('Nothing is running in the background right now.')} />
        </Card>
      ) : null}
    </Screen>
  )
}
