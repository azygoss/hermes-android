import { useQuery } from '@tanstack/react-query'
import { Check } from '@/components/icons'
import { Pressable, StyleSheet, View } from 'react-native'

import { Loading, Sheet, Text } from '@/components/ui'
import { useT } from '@/i18n'
import type { ModelOptionsResult } from '@/lib/gateway/contract.generated'
import { haptic } from '@/lib/haptics'
import { rpc } from '@/lib/hermes'
import { effortsFor, type Effort } from '@/lib/reasoning'
import { radius, space, useTheme } from '@/theme'

interface Props {
  visible: boolean
  onClose: () => void
  sessionId: string | null
  model?: string
  provider?: string
  /** The chat's current level; empty means the profile default. */
  effort?: string
  onPick: (level: Effort) => void
}

/** Reasoning levels of the chat's current model: only the ones that model and route accept. */
export function ReasoningSheet({ visible, onClose, sessionId, model, provider, effort, onPick }: Props) {
  const t = useT()
  const { c } = useTheme()
  // Same query as the model picker, so the capabilities are usually already cached.
  const options = useQuery({
    queryKey: ['model.options', sessionId],
    enabled: visible,
    queryFn: () => rpc().request('model.options', { session_id: sessionId ?? undefined }) as Promise<ModelOptionsResult>,
  })
  const row = options.data?.providers.find((p) => p.slug === provider) ?? options.data?.providers.find((p) => p.is_current)
  const levels = effortsFor(provider ?? row?.slug, model, model ? row?.capabilities?.[model] : undefined)
  const labels: Record<Effort, string> = {
    none: t('Off'),
    minimal: t('Minimal'),
    low: t('Low'),
    medium: t('Medium'),
    high: t('High'),
    xhigh: t('Extra high'),
    max: t('Max'),
  }
  return (
    <Sheet visible={visible} onClose={onClose} title={t('Reasoning effort')}>
      <Text tone="muted" variant="small">
        {levels.length
          ? t('Levels {model} supports. Higher thinks longer and costs more.', { model: model ?? t('this model') })
          : t('{model} has no reasoning control.', { model: model ?? t('This model') })}
      </Text>
      {options.isLoading ? (
        <Loading />
      ) : (
        <View style={{ gap: space.xs }}>
          {levels.map((level) => {
            const on = (effort || '') === level
            return (
              <Pressable
                key={level}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  haptic('select')
                  onPick(level)
                }}
                android_ripple={{ color: c.accentSoft }}
                style={[styles.option, { backgroundColor: on ? c.accentSoft : c.surfaceAlt }]}
              >
                <Text weight={on ? 'semibold' : 'regular'} style={{ flex: 1 }}>
                  {labels[level]}
                </Text>
                {on ? <Check size={18} color={c.accentText} /> : null}
              </Pressable>
            )
          })}
        </View>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderRadius: radius.md, paddingHorizontal: space.lg, overflow: 'hidden' },
})
