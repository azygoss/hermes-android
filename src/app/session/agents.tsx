import { Stack, useLocalSearchParams } from 'expo-router'
import { Octagon, Skull, SquareTerminal, Users } from '@/components/icons'
import { useState } from 'react'
import { View } from 'react-native'

import { Badge, Button, Card, confirm, EmptyState, prompt, Row, Screen, Section, Sheet, Text, toast, toastError } from '@/components/ui'
import { useT } from '@/i18n'
import type { ProcessEntry, SubagentSnapshot } from '@/lib/gateway/contract.generated'
import { useRpc } from '@/lib/hooks'
import { rpc } from '@/lib/hermes'
import { useChat } from '@/store/chat'
import { radius, space, useTheme } from '@/theme'

const tone = (status?: string | null) =>
  status === 'running' ? 'accent' : status === 'completed' ? 'success' : status === 'failed' || status === 'error' ? 'danger' : 'default'

export default function SessionAgents() {
  const t = useT()
  const { c } = useTheme()
  const { sid } = useLocalSearchParams<{ sid: string }>()
  const live = useChat((s) => s.sessions[sid]?.subagents ?? {})
  const subs = useRpc(['subagent.list', sid], 'subagent.list', { session_id: sid }, { refetchInterval: 3000 })
  const procs = useRpc(['process.list', sid], 'process.list', { session_id: sid }, { refetchInterval: 4000 })
  const delegation = useRpc(['delegation.status'], 'delegation.status', {}, { refetchInterval: 5000 })
  const [tail, setTail] = useState<{ id: string; text: string } | null>(null)
  const trees = useRpc(['spawn_tree.list', sid], 'spawn_tree.list', { session_id: sid, cross_session: true, limit: 10 })

  const snapshots = (subs.data?.subagents ?? []) as SubagentSnapshot[]
  const finished = Object.values(live).filter((s) => !snapshots.some((x) => x.subagent_id === s.subagent_id) && s.status !== 'running')

  async function showTail(id: string) {
    try {
      const res = await rpc().request('subagent.tail', { session_id: sid, subagent_id: id })
      const r = res as { text?: string; available?: boolean }
      setTail({ id, text: r.available ? r.text || '' : t('This subagent is no longer live.') })
    } catch (e) {
      toastError(e)
    }
  }

  return (
    <Screen refreshing={subs.isRefetching} onRefresh={() => (subs.refetch(), procs.refetch())}>
      <Stack.Screen options={{ title: t('Subagents & processes') }} />
      {delegation.data ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text weight="semibold" style={{ flex: 1 }}>
              {t('Delegation')}
            </Text>
            <Badge label={delegation.data.paused ? t('paused') : t('accepting')} tone={delegation.data.paused ? 'warn' : 'success'} />
          </View>
          <Text variant="small" tone="muted">
            {t('{n} active · depth {d} · up to {m} children', {
              n: delegation.data.active.length,
              d: delegation.data.max_spawn_depth,
              m: delegation.data.max_concurrent_children,
            })}
          </Text>
          <Button
            size="sm"
            variant="secondary"
            label={delegation.data.paused ? t('Resume new spawns') : t('Pause new spawns')}
            onPress={async () => {
              await rpc().request('delegation.pause', { paused: !delegation.data!.paused }).catch(toastError)
              void delegation.refetch()
            }}
            style={{ alignSelf: 'flex-start' }}
          />
        </Card>
      ) : null}

      <Section title={t('Live subagents')}>
        {snapshots.length ? (
          snapshots.map((s, i) => (
            <View
              key={s.subagent_id}
              style={{ padding: space.lg, gap: space.sm, borderBottomWidth: i < snapshots.length - 1 ? 1 : 0, borderBottomColor: c.border }}
            >
              <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                <Text weight="semibold" style={{ flex: 1 }} numberOfLines={2}>
                  {s.goal || s.subagent_id}
                </Text>
                <Badge label={s.status ?? '?'} tone={tone(s.status)} />
              </View>
              <Text variant="caption" tone="muted">
                {[
                  s.model,
                  s.tool_count != null ? t('{n} tools', { n: s.tool_count }) : null,
                  s.last_tool ? t('last: {tool}', { tool: s.last_tool }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                <Button size="sm" variant="secondary" label={t('Transcript')} onPress={() => showTail(s.subagent_id)} />
                {s.accepting_steer !== false ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    label={t('Steer')}
                    onPress={async () => {
                      const text = await prompt(t('Steer subagent'), { multiline: true })
                      if (!text) return
                      await rpc()
                        .request('subagent.steer', { session_id: sid, subagent_id: s.subagent_id, text })
                        .then(() => toast(t('Steering queued'), 'success'))
                        .catch(toastError)
                    }}
                  />
                ) : null}
                <Button
                  size="sm"
                  variant="dangerGhost"
                  icon={Octagon}
                  label={t('Interrupt')}
                  onPress={async () => {
                    await rpc().request('subagent.interrupt', { session_id: sid, subagent_id: s.subagent_id }).catch(toastError)
                    void subs.refetch()
                  }}
                />
              </View>
            </View>
          ))
        ) : (
          <EmptyState icon={Users} title={t('No live subagents')} body={t('When Hermes delegates work, the children show up here.')} />
        )}
      </Section>

      {finished.length ? (
        <Section title={t('Finished in this chat')}>
          {finished.map((s, i) => (
            <View
              key={s.key}
              style={{ padding: space.lg, gap: 4, borderBottomWidth: i < finished.length - 1 ? 1 : 0, borderBottomColor: c.border }}
            >
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Text weight="medium" style={{ flex: 1 }} numberOfLines={2}>
                  {s.goal}
                </Text>
                <Badge label={s.status} tone={tone(s.status)} />
              </View>
              {s.summary ? (
                <Text variant="small" tone="muted" numberOfLines={6}>
                  {s.summary}
                </Text>
              ) : null}
            </View>
          ))}
        </Section>
      ) : null}

      <Section
        title={t('Background processes')}
        action={
          (procs.data?.processes ?? []).length ? (
            <Button
              size="sm"
              variant="dangerGhost"
              label={t('Stop all')}
              onPress={async () => {
                if (!(await confirm(t('Kill every background process?'), undefined, { destructive: true, confirmLabel: t('Kill all') })))
                  return
                const res = await rpc().request('process.stop', {}).catch(toastError)
                if (res) toast(t('Stopped {n}', { n: (res as { killed?: number }).killed ?? 0 }), 'success')
                void procs.refetch()
              }}
            />
          ) : undefined
        }
      >
        {(procs.data?.processes ?? []).length ? (
          ((procs.data?.processes ?? []) as ProcessEntry[]).map((p, i, all) => (
            <View
              key={`${p.session_id}-${i}`}
              style={{ padding: space.lg, gap: space.sm, borderBottomWidth: i < all.length - 1 ? 1 : 0, borderBottomColor: c.border }}
            >
              <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                <SquareTerminal size={16} color={c.textMuted} strokeWidth={1.75} />
                <Text mono variant="small" style={{ flex: 1 }} numberOfLines={2}>
                  {p.command}
                </Text>
                <Badge label={p.status ?? '?'} tone={p.status === 'running' ? 'accent' : 'default'} />
              </View>
              {p.output_tail || p.output_preview ? (
                <View style={{ backgroundColor: c.codeBg, borderRadius: radius.sm, padding: space.sm }}>
                  <Text mono variant="caption" numberOfLines={8}>
                    {p.output_tail || p.output_preview}
                  </Text>
                </View>
              ) : null}
              {p.status === 'running' ? (
                <Button
                  size="sm"
                  variant="dangerGhost"
                  icon={Skull}
                  label={t('Kill')}
                  onPress={async () => {
                    await rpc().request('process.kill', { session_id: sid, process_id: p.session_id }).catch(toastError)
                    void procs.refetch()
                  }}
                  style={{ alignSelf: 'flex-start' }}
                />
              ) : null}
            </View>
          ))
        ) : (
          <View style={{ padding: space.lg }}>
            <Text tone="muted" variant="small">
              {t('No background processes.')}
            </Text>
          </View>
        )}
      </Section>

      {trees.data?.entries.length ? (
        <Section title={t('Saved delegation trees')}>
          {trees.data.entries.map((e, i, all) => (
            <Row
              key={e.path}
              title={e.label || e.path.split('/').pop() || e.path}
              subtitle={[
                e.count != null ? t('{n} subagents', { n: e.count }) : null,
                e.started_at ? new Date(e.started_at * 1000).toLocaleString() : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              onPress={async () => {
                try {
                  const tree = await rpc().request('spawn_tree.load', { path: e.path })
                  const lines = (tree.subagents ?? []).map(
                    (sa) => `• ${String(sa.goal ?? sa.subagent_id ?? '')} — ${String(sa.status ?? '')}`,
                  )
                  setTail({ id: e.path, text: lines.join('\n') || JSON.stringify(tree, null, 2) })
                } catch (err) {
                  toastError(err)
                }
              }}
              last={i === all.length - 1}
            />
          ))}
        </Section>
      ) : null}

      <Sheet visible={!!tail} onClose={() => setTail(null)} title={t('Subagent transcript')}>
        <Text mono variant="caption" selectable>
          {tail?.text || t('(empty)')}
        </Text>
      </Sheet>
    </Screen>
  )
}
