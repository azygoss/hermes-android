import { useQuery } from '@tanstack/react-query'
import { Check, Lock, Search } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { FlatList, Pressable, View } from 'react-native'

import { Badge, Button, confirm, ErrorState, Loading, Sheet, Text, TextField, toast, toastError, ToggleRow } from '@/components/ui'
import { useT } from '@/i18n'
import type { ModelOptionsResult } from '@/lib/gateway/contract.generated'
import { rpc } from '@/lib/hermes'
import { radius, space, useTheme } from '@/theme'

interface Props {
  visible: boolean
  onClose: () => void
  sessionId: string | null
  currentModel?: string
  currentProvider?: string
  onChanged?: () => void
}

export async function switchModel(sessionId: string | null, model: string, provider: string, global: boolean) {
  // Without an explicit flag a provider switch may persist, so say which one we mean.
  const value = `${model} --provider ${provider} ${global || !sessionId ? '--global' : '--session'}`
  const send = (confirmExpensive: boolean) =>
    rpc().request('config.set', {
      key: 'model',
      value,
      session_id: sessionId,
      ...(confirmExpensive ? { confirm_expensive_model: true } : {}),
    })
  let res = await send(false)
  if ((res as { confirm_required?: boolean }).confirm_required) {
    const ok = await confirm(String((res as { confirm_message?: string }).confirm_message ?? 'This model is expensive. Switch anyway?'))
    if (!ok) return false
    res = await send(true)
  }
  if ((res as { warning?: string }).warning) toast(String((res as { warning?: string }).warning), 'warn')
  return true
}

export function ModelPicker({ visible, onClose, sessionId, currentModel, currentProvider, onChanged }: Props) {
  const t = useT()
  const { c } = useTheme()
  const [q, setQ] = useState('')
  const [global, setGlobal] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const query = useQuery({
    queryKey: ['model.options', sessionId],
    enabled: visible,
    queryFn: () => rpc().request('model.options', { session_id: sessionId ?? undefined }) as Promise<ModelOptionsResult>,
  })

  const rows = useMemo(() => {
    const out: {
      key: string
      provider: string
      providerName: string
      model: string
      authed: boolean
      header?: boolean
      price?: string
      caps?: string
    }[] = []
    const needle = q.trim().toLowerCase()
    for (const p of query.data?.providers ?? []) {
      const models = (p.models ?? []).filter((m) => !needle || m.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle))
      if (!models.length) continue
      out.push({ key: `h-${p.slug}`, provider: p.slug, providerName: p.name, model: '', authed: !!p.authenticated, header: true })
      for (const m of models) {
        const price = (p as { pricing?: Record<string, { input?: string | number; output?: string | number; free?: boolean }> }).pricing?.[
          m
        ]
        const caps = (p as { capabilities?: Record<string, { reasoning?: boolean; fast?: boolean }> }).capabilities?.[m]
        out.push({
          key: `${p.slug}/${m}`,
          provider: p.slug,
          providerName: p.name,
          model: m,
          authed: !!p.authenticated,
          price: price?.free ? t('free') : price?.input != null ? `$${price.input} / $${price.output}` : undefined,
          caps: [caps?.reasoning ? t('reasoning') : null, caps?.fast ? t('fast') : null].filter(Boolean).join(' · ') || undefined,
        })
      }
    }
    return out
  }, [query.data, q, t])

  async function pick(provider: string, model: string) {
    setBusy(`${provider}/${model}`)
    try {
      if (await switchModel(sessionId, model, provider, global)) {
        toast(t('Model switched to {model}', { model }), 'success')
        onChanged?.()
        onClose()
      }
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t('Choose a model')} noScroll heightRatio={0.9}>
      <View style={{ gap: space.sm, paddingBottom: space.sm }}>
        <TextField placeholder={t('Search models or providers')} value={q} onChangeText={setQ} autoCapitalize="none" />
        <View style={{ marginHorizontal: -space.lg }}>
          <ToggleRow
            title={t('Make it the default')}
            subtitle={t('Otherwise only this chat switches.')}
            value={global || !sessionId}
            onChange={setGlobal}
            disabled={!sessionId}
            last
          />
        </View>
      </View>
      {query.isLoading ? <Loading /> : null}
      {query.error ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : null}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        keyboardShouldPersistTaps="handled"
        style={{ flexGrow: 0 }}
        ListEmptyComponent={query.data ? <Text tone="muted">{t('No models match.')}</Text> : null}
        renderItem={({ item }) => {
          if (item.header) {
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.md, paddingBottom: space.xs }}>
                <Text variant="small" weight="semibold" tone="muted" style={{ flex: 1 }}>
                  {item.providerName}
                </Text>
                {!item.authed ? <Badge label={t('needs key')} tone="warn" /> : null}
              </View>
            )
          }
          const current = item.model === currentModel && (!currentProvider || item.provider === currentProvider)
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: current, disabled: !item.authed }}
              onPress={() => pick(item.provider, item.model)}
              android_ripple={{ color: c.accentSoft }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                minHeight: 48,
                paddingHorizontal: space.md,
                borderRadius: radius.md,
                backgroundColor: current ? c.accentSoft : 'transparent',
                opacity: item.authed ? 1 : 0.55,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text weight={current ? 'semibold' : 'regular'} mono numberOfLines={1}>
                  {item.model}
                </Text>
                {item.price || item.caps ? (
                  <Text variant="caption" tone="faint">
                    {[item.caps, item.price].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
              </View>
              {busy === item.key ? (
                <Text variant="caption">…</Text>
              ) : current ? (
                <Check size={18} color={c.accentText} />
              ) : !item.authed ? (
                <Lock size={14} color={c.textFaint} />
              ) : null}
            </Pressable>
          )
        }}
      />
      {!query.isLoading && !rows.length && !query.error ? (
        <View style={{ alignItems: 'center', gap: space.sm, padding: space.lg }}>
          <Search size={20} color={c.textFaint} />
          <Text tone="muted">{t('No providers are set up yet. Add an API key under More → Keys.')}</Text>
        </View>
      ) : null}
      <Button label={t('Done')} variant="secondary" onPress={onClose} style={{ marginTop: space.sm }} />
    </Sheet>
  )
}

export const REASONING_LEVELS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
