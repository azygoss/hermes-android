import { Stack } from 'expo-router'
import { Cpu, Layers, Plus, RotateCcw, Trash2, Users } from 'lucide-react-native'
import { useState } from 'react'
import { Switch, View } from 'react-native'

import { ModelChooser } from '@/components/ModelChooser'
import { Badge, Button, Card, confirm, ErrorState, KeyValue, Loading, Row, Screen, Section, Text, toast, toastError } from '@/components/ui'
import { useT } from '@/i18n'
import { compact } from '@/lib/format'
import { useRest } from '@/lib/hooks'
import { hermes, rest } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { space, useTheme } from '@/theme'

interface ModelInfo {
  model: string
  provider: string
  effective_context_length?: number
  capabilities?: Record<string, unknown>
}
interface AuxTask {
  task: string
  provider: string
  model: string
  reasoning_effort?: string | null
}
interface Slot {
  provider: string
  model: string
  enabled?: boolean
  reasoning_effort?: string | null
}
interface MoaPreset {
  enabled: boolean
  reference_models: Slot[]
  aggregator: Slot
  [k: string]: unknown
}
interface MoaConfig {
  default_preset: string
  active_preset: string
  presets: Record<string, MoaPreset>
  [k: string]: unknown
}

type Target =
  | { kind: 'main' }
  | { kind: 'aux'; task: string }
  | { kind: 'moa-ref'; preset: string; index: number | null }
  | { kind: 'moa-agg'; preset: string }

async function assign(body: Record<string, unknown>) {
  let res = await rest().post<{ confirm_required?: boolean; confirm_message?: string; message?: string }>('/api/model/set', body)
  if (res?.confirm_required) {
    if (!(await confirm(res.confirm_message ?? 'This model is expensive. Use it anyway?'))) return false
    res = await rest().post('/api/model/set', { ...body, confirm_expensive_model: true })
  }
  return true
}

export default function ModelsScreen() {
  const t = useT()
  const { c } = useTheme()
  const info = useRest<ModelInfo>(['model-info'], '/api/model/info')
  const aux = useRest<{ tasks: AuxTask[] }>(['model-aux'], '/api/model/auxiliary')
  const moa = useRest<MoaConfig>(['model-moa'], '/api/model/moa')
  const [target, setTarget] = useState<Target | null>(null)
  const refresh = () => queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('model') })

  async function saveMoa(next: MoaConfig) {
    queryClient.setQueryData(['model-moa'], next)
    try {
      await rest().put('/api/model/moa', { ...next, profile: hermes().profile ?? undefined })
    } catch (e) {
      toastError(e)
      void moa.refetch()
    }
  }

  async function onPick(provider: string, model: string) {
    if (!target) return
    try {
      if (target.kind === 'main') {
        if (await assign({ scope: 'main', provider, model })) toast(t('Main model: {model}', { model }), 'success')
      } else if (target.kind === 'aux') {
        await assign({ scope: 'auxiliary', task: target.task, provider, model })
        toast(t('{task} → {model}', { task: target.task, model: model || 'auto' }), 'success')
      } else if (moa.data) {
        const preset = moa.data.presets[target.preset]
        const slot = { provider, model, enabled: true }
        const updated: MoaPreset =
          target.kind === 'moa-agg'
            ? { ...preset, aggregator: slot }
            : {
                ...preset,
                reference_models:
                  target.index == null
                    ? [...preset.reference_models, slot]
                    : preset.reference_models.map((s, i) => (i === target.index ? slot : s)),
              }
        await saveMoa({ ...moa.data, presets: { ...moa.data.presets, [target.preset]: updated } })
      }
      await refresh()
    } catch (e) {
      toastError(e)
    }
  }

  return (
    <Screen refreshing={info.isRefetching} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('Models & providers') }} />
      {info.isLoading ? <Loading /> : null}
      {info.error ? <ErrorState error={info.error} onRetry={() => info.refetch()} /> : null}
      {info.data ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Cpu size={20} color={c.accentText} />
            <Text weight="semibold" style={{ flex: 1 }}>
              {t('Main model')}
            </Text>
            <Badge label={info.data.provider} tone="accent" />
          </View>
          <Text variant="h2" mono>
            {info.data.model || t('Not set')}
          </Text>
          <KeyValue label={t('Context window')} value={compact(info.data.effective_context_length)} />
          <Button label={t('Change main model')} onPress={() => setTarget({ kind: 'main' })} style={{ alignSelf: 'flex-start' }} />
          <Text variant="caption" tone="faint">
            {t('The default for new chats and messaging platforms. A chat can still switch on its own from the model pill.')}
          </Text>
        </Card>
      ) : null}

      <Section
        title={t('Auxiliary models')}
        action={
          <Button
            size="sm"
            variant="ghost"
            icon={RotateCcw}
            label={t('Reset all')}
            onPress={async () => {
              if (!(await confirm(t('Reset every auxiliary task to the main model?')))) return
              await assign({ scope: 'auxiliary', task: '__reset__', provider: 'auto', model: '' }).catch(toastError)
              void refresh()
            }}
          />
        }
        footer={t('Side tasks (titles, compression, vision, approvals…) can run on cheaper or faster models.')}
      >
        {(aux.data?.tasks ?? []).map((task, i, all) => (
          <Row
            key={task.task}
            icon={Layers}
            title={task.task.replace(/_/g, ' ')}
            value={task.provider === 'auto' || !task.model ? t('main model') : `${task.model}`}
            subtitle={task.provider !== 'auto' ? task.provider : undefined}
            onPress={() => setTarget({ kind: 'aux', task: task.task })}
            last={i === all.length - 1}
          />
        ))}
        {aux.isLoading ? <Loading /> : null}
      </Section>

      {moa.data
        ? Object.entries(moa.data.presets).map(([name, preset]) => (
            <Section
              key={name}
              title={t('Mixture of Agents · {name}', { name })}
              action={
                <Switch
                  value={preset.enabled}
                  onValueChange={(v) => saveMoa({ ...moa.data!, presets: { ...moa.data!.presets, [name]: { ...preset, enabled: v } } })}
                  trackColor={{ false: c.borderStrong, true: c.accent }}
                  thumbColor={preset.enabled ? c.onAccent : c.textMuted}
                  accessibilityLabel={t('Enable preset {name}', { name })}
                />
              }
              footer={t('/moa <prompt> asks every reference model, then the aggregator writes the final answer.')}
            >
              {preset.reference_models.map((slot, i) => (
                <Row
                  key={`${slot.provider}-${slot.model}-${i}`}
                  icon={Users}
                  title={slot.model || t('(empty)')}
                  subtitle={slot.provider}
                  onPress={() => setTarget({ kind: 'moa-ref', preset: name, index: i })}
                  right={
                    <Button
                      size="sm"
                      variant="dangerGhost"
                      icon={Trash2}
                      label={t('Remove')}
                      onPress={() =>
                        saveMoa({
                          ...moa.data!,
                          presets: {
                            ...moa.data!.presets,
                            [name]: { ...preset, reference_models: preset.reference_models.filter((_, j) => j !== i) },
                          },
                        })
                      }
                    />
                  }
                />
              ))}
              <Row
                icon={Plus}
                title={t('Add a reference model')}
                onPress={() => setTarget({ kind: 'moa-ref', preset: name, index: null })}
              />
              <Row
                icon={Cpu}
                title={t('Aggregator: {model}', { model: preset.aggregator.model || '—' })}
                subtitle={preset.aggregator.provider}
                onPress={() => setTarget({ kind: 'moa-agg', preset: name })}
                last
              />
            </Section>
          ))
        : null}

      <ModelChooser
        visible={!!target}
        title={
          target?.kind === 'main'
            ? t('Main model')
            : target?.kind === 'aux'
              ? t('Model for {task}', { task: target.task })
              : target?.kind === 'moa-agg'
                ? t('Aggregator model')
                : t('Reference model')
        }
        allowAuto={target?.kind === 'aux'}
        onClose={() => setTarget(null)}
        onPick={onPick}
      />
    </Screen>
  )
}
