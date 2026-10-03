import { useQuery } from '@tanstack/react-query'
import { Check, Lock, Search } from '@/components/icons'
import { useMemo, useState } from 'react'
import { FlatList, Pressable, View } from 'react-native'

import { Button, confirm, ErrorState, Loading, prompt, Sheet, Text, TextField, toast, toastError, ToggleRow } from '@/components/ui'
import { t, useT } from '@/i18n'
import type { ModelOptionsResult } from '@/lib/gateway/contract.generated'
import { rest, rpc } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { closeRuntime, newChat, useChat } from '@/store/chat'
import { useSettings } from '@/store/settings'
import { radius, space, useTheme } from '@/theme'

interface Props {
  visible: boolean
  onClose: () => void
  sessionId: string | null
  currentModel?: string
  currentProvider?: string
  onChanged?: () => void
}

async function confirmed<T extends { confirm_required?: boolean | null; confirm_message?: string | null }>(
  send: (force: boolean) => Promise<T>,
) {
  let res = await send(false)
  if (res?.confirm_required) {
    if (!(await confirm(res.confirm_message ?? t('This model is expensive. Switch anyway?')))) return null
    res = await send(true)
  }
  return res
}

/** Switch the model of a live chat only (config.set needs a live session). */
async function switchSession(sessionId: string, model: string, provider: string) {
  const res = await confirmed((force) =>
    rpc().request('config.set', {
      key: 'model',
      // Without an explicit flag a provider switch may persist, so say we mean this chat only.
      value: `${model} --provider ${provider} --session`,
      session_id: sessionId,
      ...(force ? { confirm_expensive_model: true } : {}),
    }),
  )
  if (!res) return false
  if (res.warning) toast(res.warning, 'warn')
  useChat.setState((st) => {
    const cur = st.sessions[sessionId]
    if (!cur) return st
    return { sessions: { ...st.sessions, [sessionId]: { ...cur, info: { ...cur.info, ...(res.info ?? {}), model, provider } } } }
  })
  return true
}

/** Make the model the profile default (same route as the Models screen). */
async function switchDefault(model: string, provider: string) {
  const res = await confirmed((force) =>
    rest().post<{ confirm_required?: boolean; confirm_message?: string }>('/api/model/set', {
      scope: 'main',
      provider,
      model,
      ...(force ? { confirm_expensive_model: true } : {}),
    }),
  )
  if (!res) return false
  await queryClient.invalidateQueries({ queryKey: ['model-info'] })
  return true
}

/** A chat that exists but has not run a turn yet: its agent is built lazily, so config.set is lost. */
function isFresh(sessionId: string | null) {
  const s = sessionId ? useChat.getState().sessions[sessionId] : null
  return !!s && !s.busy && !s.messages.some((m) => m.role !== 'system') && !s.attachments.length
}

/** Start the chat on the picked model (session.create applies it to the first turn). */
async function startOn(sessionId: string | null, model: string, provider: string) {
  if (sessionId) await closeRuntime(sessionId)
  await newChat({ model, provider })
  return true
}

/**
 * Apply a model pick. "Default" persists it for new chats; the open chat follows either way.
 * A chat that has not run yet is (re)created on the model, because a live switch only takes
 * effect once the agent exists.
 */
export async function switchModel(sessionId: string | null, model: string, provider: string, makeDefault: boolean) {
  if (makeDefault && !(await switchDefault(model, provider))) return false
  if (!sessionId || isFresh(sessionId)) return makeDefault && !sessionId ? true : startOn(sessionId, model, provider)
  return switchSession(sessionId, model, provider)
}

export function ModelPicker({ visible, onClose, sessionId, currentModel, currentProvider, onChanged }: Props) {
  const t = useT()
  const { c } = useTheme()
  const [q, setQ] = useState('')
  const [global, setGlobal] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const recentModels = useSettings((s) => s.recentModels)
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
      /** Header without provider key actions (the Recent group). */
      plain?: boolean
      price?: string
      caps?: string
    }[] = []
    const needle = q.trim().toLowerCase()
    const providers = query.data?.providers ?? []
    // Recently used models first, while not searching; only ones the backend still offers.
    const recent = needle
      ? []
      : recentModels.filter((r) => providers.some((p) => p.slug === r.provider && p.authenticated && p.models?.includes(r.model)))
    if (recent.length) {
      out.push({ key: 'h-recent', provider: '', providerName: t('Recent'), model: '', authed: true, header: true, plain: true })
      for (const r of recent) {
        const p = providers.find((x) => x.slug === r.provider)!
        out.push({
          key: `recent-${r.provider}/${r.model}`,
          provider: r.provider,
          providerName: p.name,
          model: r.model,
          authed: true,
          caps: p.name,
        })
      }
    }
    for (const p of providers) {
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
  }, [query.data, q, t, recentModels])

  async function addKey(slug: string, name: string) {
    const key = await prompt(t('API key for {p}', { p: name }), { secret: true })
    if (!key) return
    try {
      await rpc().request('model.save_key', { slug, api_key: key.trim(), session_id: sessionId })
      toast(t('{name} is ready', { name }), 'success')
      void query.refetch()
    } catch (e) {
      toastError(e)
    }
  }

  async function disconnect(slug: string, name: string) {
    if (
      !(await confirm(
        t('Remove the credentials for {name}?', { name }),
        t('API keys and sign-ins for this provider are deleted on the backend.'),
        { destructive: true, confirmLabel: t('Remove') },
      ))
    )
      return
    try {
      await rpc().request('model.disconnect', { slug, session_id: sessionId })
      void query.refetch()
    } catch (e) {
      toastError(e)
    }
  }

  async function pick(provider: string, model: string) {
    setBusy(`${provider}/${model}`)
    try {
      if (await switchModel(sessionId, model, provider, global)) {
        const prev = useSettings.getState().recentModels.filter((r) => !(r.provider === provider && r.model === model))
        useSettings.getState().set({ recentModels: [{ provider, model }, ...prev].slice(0, 4) })
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
            value={global}
            onChange={setGlobal}
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
                {item.plain ? null : !item.authed ? (
                  <Button size="sm" variant="ghost" label={t('Add key')} onPress={() => addKey(item.provider, item.providerName)} />
                ) : (
                  <Button size="sm" variant="ghost" label={t('Disconnect')} onPress={() => disconnect(item.provider, item.providerName)} />
                )}
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
              {busy === `${item.provider}/${item.model}` ? (
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

