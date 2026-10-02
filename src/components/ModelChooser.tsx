import { useQuery } from '@tanstack/react-query'
import { Lock, RotateCcw } from '@/components/icons'
import { useMemo, useState } from 'react'
import { FlatList, Pressable, View } from 'react-native'

import { Badge, ErrorState, Loading, Sheet, Text, TextField } from '@/components/ui'
import { useT } from '@/i18n'
import { rest } from '@/lib/hermes'
import { radius, space, useTheme } from '@/theme'

interface ProviderRow {
  slug: string
  name: string
  models: string[]
  authenticated?: boolean
}

/** Pick provider + model from the backend inventory (/api/model/options). */
export function ModelChooser({
  visible,
  title,
  onClose,
  onPick,
  allowAuto,
}: {
  visible: boolean
  title: string
  onClose: () => void
  onPick: (provider: string, model: string) => void
  /** Offer "use the main model" (provider auto). */
  allowAuto?: boolean
}) {
  const t = useT()
  const { c } = useTheme()
  const [q, setQ] = useState('')
  const opts = useQuery({
    queryKey: ['model-options-rest'],
    enabled: visible,
    queryFn: () => rest().get<{ providers: ProviderRow[] }>('/api/model/options'),
  })
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out: { key: string; header?: string; provider?: string; model?: string; authed?: boolean }[] = []
    for (const p of opts.data?.providers ?? []) {
      const ms = p.models.filter((m) => !needle || m.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle))
      if (!ms.length) continue
      out.push({ key: `h-${p.slug}`, header: p.name, authed: p.authenticated !== false })
      for (const m of ms) out.push({ key: `${p.slug}/${m}`, provider: p.slug, model: m, authed: p.authenticated !== false })
    }
    return out
  }, [opts.data, q])

  return (
    <Sheet visible={visible} onClose={onClose} title={title} noScroll heightRatio={0.9}>
      <View style={{ gap: space.sm, paddingBottom: space.sm }}>
        <TextField placeholder={t('Search models or providers')} value={q} onChangeText={setQ} autoCapitalize="none" />
        {allowAuto ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => (onPick('auto', ''), onClose())}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              minHeight: 48,
              paddingHorizontal: space.md,
              borderRadius: radius.md,
              backgroundColor: c.surfaceAlt,
            }}
          >
            <RotateCcw size={16} color={c.accentText} />
            <Text weight="medium">{t('Auto — use the main model')}</Text>
          </Pressable>
        ) : null}
      </View>
      {opts.isLoading ? <Loading /> : null}
      {opts.error ? <ErrorState error={opts.error} onRetry={() => opts.refetch()} /> : null}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        keyboardShouldPersistTaps="handled"
        style={{ flexGrow: 0 }}
        renderItem={({ item }) =>
          item.header ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.md, paddingBottom: 4 }}>
              <Text variant="small" weight="semibold" tone="muted" style={{ flex: 1 }}>
                {item.header}
              </Text>
              {!item.authed ? <Badge label={t('needs key')} tone="warn" /> : null}
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => (onPick(item.provider!, item.model!), onClose())}
              android_ripple={{ color: c.accentSoft }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                minHeight: 46,
                paddingHorizontal: space.md,
                gap: space.sm,
                opacity: item.authed ? 1 : 0.55,
              }}
            >
              <Text mono style={{ flex: 1 }} numberOfLines={1}>
                {item.model}
              </Text>
              {!item.authed ? <Lock size={14} color={c.textFaint} /> : null}
            </Pressable>
          )
        }
      />
    </Sheet>
  )
}
