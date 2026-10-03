import { Stack, useLocalSearchParams } from 'expo-router'
import { HeartPulse, Repeat, Target, Trash2 } from '@/components/icons'
import { View } from 'react-native'

import { Badge, Button, Card, EmptyState, ErrorState, KeyValue, Loading, prompt, Screen, Section, Text, toastError } from '@/components/ui'
import { useT } from '@/i18n'
import { dateTime } from '@/lib/format'
import { useRpc } from '@/lib/hooks'
import { rpc } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { runSlash } from '@/store/chat'
import { space, useTheme } from '@/theme'

function every(seconds?: number) {
  if (!seconds) return '—'
  if (seconds % 3600 === 0) return `${seconds / 3600}h`
  if (seconds % 60 === 0) return `${seconds / 60}m`
  return `${seconds}s`
}

export default function GoalsScreen() {
  const t = useT()
  const { c } = useTheme()
  const { sid } = useLocalSearchParams<{ sid: string }>()
  const q = useRpc(['session.control.read', sid], 'session.control.read', { session_id: sid }, { refetchInterval: 30_000 })
  const control = q.data?.control

  const act = async (action: string, args?: { text?: string; index?: number }) => {
    try {
      await rpc().request('session.control', { session_id: sid, action, args: args ?? null })
      await queryClient.invalidateQueries({ queryKey: ['session.control.read', sid] })
    } catch (e) {
      toastError(e)
    }
  }
  const slash = async (cmd: string) => {
    try {
      await runSlash(sid, cmd)
      await queryClient.invalidateQueries({ queryKey: ['session.control.read', sid] })
    } catch (e) {
      toastError(e)
    }
  }

  const goal = control?.goal
  const loop = control?.loop
  const hb = control?.heartbeat

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Stack.Screen options={{ title: t('Goal, loop & heartbeat') }} />
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}

      <Section title={t('Standing goal')}>
        {goal ? (
          <View style={{ padding: space.lg, gap: space.sm }}>
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
              <Target size={18} color={c.textMuted} strokeWidth={1.75} />
              <Text weight="semibold" style={{ flex: 1 }}>
                {goal.title}
              </Text>
              <Badge label={goal.status} tone={goal.status === 'active' ? 'accent' : goal.status === 'done' ? 'success' : 'default'} />
            </View>
            <KeyValue label={t('Turns')} value={`${goal.turns_used} / ${goal.max_turns || '∞'}`} />
            {goal.last_verdict ? (
              <KeyValue label={t('Last verdict')} value={`${goal.last_verdict}${goal.last_reason ? ` — ${goal.last_reason}` : ''}`} />
            ) : null}
            {goal.paused_reason ? <KeyValue label={t('Paused because')} value={goal.paused_reason} /> : null}
            <Text variant="small" weight="semibold" tone="muted">
              {t('Success criteria')}
            </Text>
            {goal.subgoals.length ? (
              goal.subgoals.map((sg, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Text variant="small" style={{ flex: 1 }}>
                    {i + 1}. {sg}
                  </Text>
                  <Button
                    size="sm"
                    variant="dangerGhost"
                    icon={Trash2}
                    label={t('Remove')}
                    onPress={() => act('subgoal.remove', { index: i + 1 })}
                  />
                </View>
              ))
            ) : (
              <Text variant="small" tone="faint">
                {t('None yet.')}
              </Text>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              <Button
                size="sm"
                variant="secondary"
                label={t('Add criterion')}
                onPress={async () => {
                  const text = await prompt(t('Add a success criterion'), { placeholder: t('e.g. all tests pass') })
                  if (text) await act('subgoal.add', { text })
                }}
              />
              {goal.status === 'paused' ? (
                <Button size="sm" label={t('Resume')} onPress={() => act('goal.resume')} />
              ) : (
                <Button size="sm" variant="secondary" label={t('Pause')} onPress={() => act('goal.pause')} />
              )}
              {goal.wait_barrier ? (
                <Button size="sm" variant="secondary" label={t('Stop waiting')} onPress={() => act('goal.unwait')} />
              ) : null}
              <Button size="sm" variant="dangerGhost" label={t('Clear goal')} onPress={() => act('goal.clear')} />
            </View>
          </View>
        ) : (
          <View style={{ padding: space.lg, gap: space.md }}>
            <Text tone="muted" variant="small">
              {t('A goal keeps Hermes working across turns until the criteria are met.')}
            </Text>
            <Button
              label={t('Set a goal')}
              icon={Target}
              onPress={async () => {
                const text = await prompt(t('Set a standing goal'), { multiline: true, placeholder: t('e.g. Get the test suite green') })
                if (text) await slash(`/goal ${text}`)
              }}
              style={{ alignSelf: 'flex-start' }}
            />
          </View>
        )}
      </Section>

      <Section title={t('Loop')}>
        {loop ? (
          <View style={{ padding: space.lg, gap: space.sm }}>
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
              <Repeat size={18} color={c.textMuted} strokeWidth={1.75} />
              <Text weight="semibold" style={{ flex: 1 }} numberOfLines={3}>
                {loop.prompt}
              </Text>
              <Badge label={loop.status} tone={loop.status === 'active' ? 'accent' : 'default'} />
            </View>
            <KeyValue label={t('Every')} value={every(loop.interval_seconds)} />
            <KeyValue label={t('Fired')} value={`${loop.ticks_fired}${loop.times ? ` / ${loop.times}` : ''}`} />
            {loop.next_due_at ? <KeyValue label={t('Next run')} value={dateTime(loop.next_due_at)} /> : null}
            {loop.until ? <KeyValue label={t('Until')} value={loop.until} /> : null}
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {loop.status === 'paused' ? (
                <Button size="sm" label={t('Resume')} onPress={() => act('loop.resume')} />
              ) : (
                <Button size="sm" variant="secondary" label={t('Pause')} onPress={() => act('loop.pause')} />
              )}
              <Button size="sm" variant="dangerGhost" label={t('Stop')} onPress={() => act('loop.stop')} />
            </View>
          </View>
        ) : (
          <View style={{ padding: space.lg, gap: space.md }}>
            <Text tone="muted" variant="small">
              {t('Run a prompt on repeat in this chat, e.g. "check the build every 10 minutes".')}
            </Text>
            <Button
              label={t('Start a loop')}
              icon={Repeat}
              variant="secondary"
              onPress={async () => {
                const interval = await prompt(t('How often?'), { placeholder: '10m', initial: '10m' })
                if (!interval) return
                const text = await prompt(t('What should it do each time?'), { multiline: true })
                if (text) await slash(`/loop ${interval} ${text}`)
              }}
              style={{ alignSelf: 'flex-start' }}
            />
          </View>
        )}
      </Section>

      <Section title={t('Heartbeat')}>
        {hb ? (
          <View style={{ padding: space.lg, gap: space.sm }}>
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
              <HeartPulse size={18} color={c.textMuted} strokeWidth={1.75} />
              <Text weight="semibold" style={{ flex: 1 }} numberOfLines={3}>
                {hb.prompt}
              </Text>
              <Badge label={hb.status} />
            </View>
            <KeyValue label={t('Every')} value={every(hb.interval_seconds)} />
            <KeyValue label={t('Fired')} value={String(hb.fire_count)} />
            {hb.last_fired_at ? <KeyValue label={t('Last')} value={dateTime(hb.last_fired_at)} /> : null}
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {hb.status === 'paused' ? (
                <Button size="sm" label={t('Resume')} onPress={() => act('heartbeat.resume')} />
              ) : (
                <Button size="sm" variant="secondary" label={t('Pause')} onPress={() => act('heartbeat.pause')} />
              )}
              <Button size="sm" variant="dangerGhost" label={t('Clear')} onPress={() => act('heartbeat.clear')} />
            </View>
          </View>
        ) : (
          <View style={{ padding: space.lg, gap: space.md }}>
            <Text tone="muted" variant="small">
              {t('Re-enter this chat with a prompt whenever it has been idle for a while.')}
            </Text>
            <Button
              label={t('Add a heartbeat')}
              icon={HeartPulse}
              variant="secondary"
              onPress={async () => {
                const interval = await prompt(t('Idle interval'), { placeholder: '30m', initial: '30m' })
                if (!interval) return
                const text = await prompt(t('Prompt to send'), { multiline: true })
                if (text) await slash(`/heartbeat every ${interval} ${text}`)
              }}
              style={{ alignSelf: 'flex-start' }}
            />
          </View>
        )}
      </Section>
      {!goal && !loop && !hb && !q.isLoading ? (
        <Card>
          <EmptyState icon={Target} title={t('Nothing scheduled in this chat')} />
        </Card>
      ) : null}
    </Screen>
  )
}
