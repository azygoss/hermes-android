import { View } from 'react-native'

import { Chip, Text, TextField, ToggleRow } from '@/components/ui'
import { useT } from '@/i18n'
import { space } from '@/theme'

export interface FieldSpec {
  key: string
  label?: string
  kind?: 'text' | 'secret' | 'select' | 'boolean' | 'integer' | 'number' | string
  type?: string
  description?: string
  placeholder?: string
  required?: boolean
  is_set?: boolean
  has_value?: boolean
  options?: { value: string; label: string }[]
  choices?: string[] | null
  value?: unknown
  default?: unknown
}

/** One form control for a backend-described field (memory providers, plugin settings, config schema). */
export function FieldInput({ spec, value, onChange }: { spec: FieldSpec; value: unknown; onChange: (v: unknown) => void }) {
  const t = useT()
  const kind = spec.kind ?? spec.type ?? 'text'
  const label = `${spec.label ?? spec.key}${spec.required ? ' *' : ''}`
  const options = spec.options ?? (spec.choices ?? []).map((c) => ({ value: c, label: c }))

  if (kind === 'boolean' || kind === 'bool') {
    return (
      <View style={{ marginHorizontal: -space.lg }}>
        <ToggleRow title={label} subtitle={spec.description} value={!!(value ?? spec.default)} onChange={onChange} last />
      </View>
    )
  }
  if ((kind === 'select' || kind === 'choice' || kind === 'enum') && options.length) {
    const current = String(value ?? spec.default ?? '')
    return (
      <View style={{ gap: space.xs }}>
        <Text variant="small" weight="medium" tone="muted">
          {label}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
          {options.map((o) => (
            <Chip key={o.value} label={o.label} selected={current === o.value} onPress={() => onChange(o.value)} />
          ))}
        </View>
        {spec.description ? (
          <Text variant="caption" tone="faint">
            {spec.description}
          </Text>
        ) : null}
      </View>
    )
  }
  const secret = kind === 'secret' || kind === 'password'
  const numeric = kind === 'integer' || kind === 'number' || kind === 'int' || kind === 'float'
  return (
    <TextField
      label={label}
      helper={spec.description}
      secret={secret}
      value={value == null ? '' : String(value)}
      placeholder={
        secret && (spec.is_set || spec.has_value)
          ? t('Set — leave empty to keep')
          : (spec.placeholder ?? (spec.default != null ? String(spec.default) : undefined))
      }
      keyboardType={numeric ? 'numeric' : 'default'}
      autoCapitalize="none"
      onChangeText={(v) => onChange(numeric ? (v === '' ? '' : Number.isNaN(Number(v)) ? v : Number(v)) : v)}
      mono={secret}
    />
  )
}
