import { Wand2 } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { FieldInput } from '@/components/FieldInput'
import { Badge, Button, ErrorState, Loading, Sheet, Text, toast, toastError } from '@/components/ui'
import { useT } from '@/i18n'
import { useRest } from '@/lib/hooks'
import { rest } from '@/lib/hermes'
import { radius, space, useTheme } from '@/theme'

interface BlueprintField {
  name: string
  type: string
  label: string
  default?: string
  options?: string[]
  optional?: boolean
  help?: string
}
interface Blueprint {
  key: string
  title: string
  description: string
  category: string
  tags: string[]
  fields: BlueprintField[]
  scheduleHuman?: string
}

/** Ready-made automations: fill a few slots and they become cron jobs. */
export function BlueprintsTab({ onCreated }: { onCreated: () => void }) {
  const t = useT()
  const { c } = useTheme()
  const q = useRest<{ blueprints: Blueprint[] }>(['cron', 'blueprints'], '/api/cron/blueprints')
  const [selected, setSelected] = useState<Blueprint | null>(null)
  return (
    <>
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
      {(q.data?.blueprints ?? []).map((b) => (
        <Pressable
          key={b.key}
          accessibilityRole="button"
          onPress={() => setSelected(b)}
          style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Wand2 size={16} color={c.textMuted} strokeWidth={1.75} />
            <Text weight="semibold" style={{ flex: 1 }}>
              {b.title}
            </Text>
            <Badge label={b.category} />
          </View>
          <Text variant="small" tone="muted">
            {b.description}
          </Text>
        </Pressable>
      ))}
      <BlueprintSheet blueprint={selected} onClose={() => setSelected(null)} onCreated={onCreated} />
    </>
  )
}

function BlueprintSheet({ blueprint, onClose, onCreated }: { blueprint: Blueprint | null; onClose: () => void; onCreated: () => void }) {
  const t = useT()
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const create = async () => {
    if (!blueprint) return
    setBusy(true)
    try {
      const filled = Object.fromEntries(blueprint.fields.map((f) => [f.name, String(values[f.name] ?? f.default ?? '')]))
      await rest().post('/api/cron/blueprints/instantiate', { blueprint: blueprint.key, values: filled })
      toast(t('Automation created'), 'success')
      setValues({})
      onCreated()
      onClose()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet
      visible={!!blueprint}
      onClose={onClose}
      title={blueprint?.title}
      footer={<Button label={t('Create automation')} onPress={create} loading={busy} />}
    >
      <Text tone="muted">{blueprint?.description}</Text>
      {(blueprint?.fields ?? []).map((f) => (
        <FieldInput
          key={f.name}
          spec={{
            key: f.name,
            label: f.label,
            kind: f.type === 'enum' ? 'select' : f.type === 'bool' || f.type === 'boolean' ? 'boolean' : 'text',
            description: f.help,
            options: (f.options ?? []).map((o) => ({ value: o, label: o })),
            default: f.default,
            placeholder: f.default,
            required: !f.optional,
          }}
          value={values[f.name] ?? (f.type === 'enum' ? f.default : undefined)}
          onChange={(v) => setValues((cur) => ({ ...cur, [f.name]: v }))}
        />
      ))}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.md, gap: space.xs },
})
