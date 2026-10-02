import { Stack } from 'expo-router'
import { FileCode2, Save } from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'

import { FieldInput } from '@/components/FieldInput'
import {
  Button,
  Chip,
  ErrorState,
  KeyValue,
  Loading,
  Screen,
  Section,
  Segmented,
  Text,
  TextField,
  toast,
  toastError,
} from '@/components/ui'
import { useT } from '@/i18n'
import { useRest, useRpc } from '@/lib/hooks'
import { hermes, rest } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { space } from '@/theme'

interface SchemaField {
  type: 'string' | 'number' | 'boolean' | 'select' | 'list'
  description?: string
  category?: string
  options?: string[]
}

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj)
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.')
  let cur: Record<string, unknown> = obj
  keys.slice(0, -1).forEach((k) => {
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {}
    cur = cur[k] as Record<string, unknown>
  })
  cur[keys[keys.length - 1]] = value
}

export default function ConfigScreen() {
  const t = useT()
  const [mode, setMode] = useState<'summary' | 'form' | 'yaml'>('summary')
  return (
    <Screen>
      <Stack.Screen options={{ title: t('Configuration') }} />
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'summary', label: t('Summary') },
          { value: 'form', label: t('Settings') },
          { value: 'yaml', label: 'config.yaml' },
        ]}
      />
      {mode === 'summary' ? <ConfigSummary /> : mode === 'form' ? <ConfigForm /> : <RawYaml />}
    </Screen>
  )
}

function ConfigForm() {
  const t = useT()
  const schema = useRest<{ fields: Record<string, SchemaField>; category_order: string[] }>(['config', 'schema'], '/api/config/schema')
  const config = useRest<Record<string, unknown>>(['config', 'values'], '/api/config')
  const [category, setCategory] = useState('general')
  const [filter, setFilter] = useState('')
  const [edits, setEdits] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)

  const fields = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return Object.entries(schema.data?.fields ?? {}).filter(([key, f]) =>
      needle
        ? key.toLowerCase().includes(needle) || (f.description ?? '').toLowerCase().includes(needle)
        : (f.category ?? 'general') === category,
    )
  }, [schema.data, category, filter])

  async function save() {
    setSaving(true)
    try {
      // The backend deep-merges over disk, so send only what changed.
      const next: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(edits)) setPath(next, k, v)
      await rest().put('/api/config', { config: next, profile: hermes().profile ?? undefined })
      toast(t('Configuration saved — new chats pick it up'), 'success')
      setEdits({})
      await queryClient.invalidateQueries({ queryKey: ['config'] })
    } catch (e) {
      toastError(e)
    } finally {
      setSaving(false)
    }
  }

  if (schema.isLoading || config.isLoading) return <Loading />
  if (schema.error || config.error)
    return <ErrorState error={schema.error ?? config.error} onRetry={() => (schema.refetch(), config.refetch())} />

  return (
    <>
      <TextField
        placeholder={t('Search {n} settings', { n: Object.keys(schema.data?.fields ?? {}).length })}
        value={filter}
        onChangeText={setFilter}
        autoCapitalize="none"
      />
      {!filter ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
          {(schema.data?.category_order ?? []).map((c) => (
            <Chip key={c} label={c} selected={c === category} onPress={() => setCategory(c)} />
          ))}
        </View>
      ) : null}
      <Section>
        <View style={{ padding: space.lg, gap: space.lg }}>
          {fields.slice(0, 150).map(([key, f]) => {
            const current = key in edits ? edits[key] : getPath(config.data, key)
            if (f.type === 'list') {
              const text = Array.isArray(current) ? current.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n') : ''
              return (
                <TextField
                  key={key}
                  label={key}
                  helper={`${f.description ?? ''} ${t('(one per line)')}`}
                  value={text}
                  multiline
                  minLines={2}
                  mono
                  autoCapitalize="none"
                  onChangeText={(v) =>
                    setEdits((cur) => ({
                      ...cur,
                      [key]: v
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .map((s) => {
                          try {
                            return s.startsWith('{') ? JSON.parse(s) : s
                          } catch {
                            return s
                          }
                        }),
                    }))
                  }
                />
              )
            }
            return (
              <FieldInput
                key={key}
                spec={{
                  key,
                  label: key,
                  kind: f.type === 'string' ? 'text' : f.type,
                  description: f.description,
                  options: (f.options ?? []).map((o) => ({ value: o, label: o || t('(default)') })),
                }}
                value={current}
                onChange={(v) => setEdits((cur) => ({ ...cur, [key]: v }))}
              />
            )
          })}
          {!fields.length ? <Text tone="muted">{t('No settings match.')}</Text> : null}
        </View>
      </Section>
      <Button
        label={t('Save {n} changes', { n: Object.keys(edits).length })}
        icon={Save}
        onPress={save}
        loading={saving}
        disabled={!Object.keys(edits).length}
      />
    </>
  )
}

function RawYaml() {
  const t = useT()
  const q = useRest<{ yaml?: string; yaml_text?: string; content?: string }>(['config', 'raw'], '/api/config/raw')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (q.data) setText(q.data.yaml_text ?? q.data.yaml ?? q.data.content ?? '')
  }, [q.data])
  const save = async () => {
    setSaving(true)
    try {
      await rest().put('/api/config/raw', { yaml_text: text })
      toast(t('config.yaml saved'), 'success')
      await queryClient.invalidateQueries({ queryKey: ['config'] })
    } catch (e) {
      toastError(e)
    } finally {
      setSaving(false)
    }
  }
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  return (
    <>
      <Text variant="small" tone="muted">
        {t('Edit the raw file. Invalid YAML is rejected by the backend.')}
      </Text>
      <TextField value={text} onChangeText={setText} multiline minLines={24} mono autoCapitalize="none" autoCorrect={false} />
      <Button label={t('Save config.yaml')} icon={FileCode2} onPress={save} loading={saving} />
    </>
  )
}

function ConfigSummary() {
  const t = useT()
  const q = useRpc(['config', 'show'], 'config.show', {})
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  return (
    <>
      {(q.data?.sections ?? []).map((sec) => (
        <Section key={sec.title} title={sec.title}>
          <View style={{ padding: space.lg }}>
            {(sec.rows ?? []).map((row, i) => (
              <KeyValue key={i} label={row[0] ?? ''} value={row.slice(1).join(' ') || '—'} />
            ))}
          </View>
        </Section>
      ))}
      {!q.data?.sections?.length ? <Text tone="muted">{t('No summary available.')}</Text> : null}
    </>
  )
}
