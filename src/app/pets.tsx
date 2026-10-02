import { Image } from 'expo-image'
import { Stack } from 'expo-router'
import { Check, PawPrint } from 'lucide-react-native'
import { memo, useMemo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, View } from 'react-native'

import { Badge, Button, EmptyState, ErrorState, Loading, Segmented, Text, TextField, toast, toastError } from '@/components/ui'
import { useT } from '@/i18n'
import type { PetGalleryEntry } from '@/lib/gateway/contract.generated'
import { useRpc } from '@/lib/hooks'
import { rpc, useProfile } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { radius, space, useTheme } from '@/theme'

const PetThumb = memo(function PetThumb({ slug }: { slug: string }) {
  const profile = useProfile()
  const q = useRpc(['pets', 'thumb', slug], 'pet.thumb', { slug, profile }, { staleTime: Infinity })
  return q.data?.dataUri ? (
    <Image source={{ uri: q.data.dataUri }} style={{ width: 64, height: 64 }} contentFit="contain" />
  ) : (
    <View style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}>
      <PawPrint size={28} color="#777" />
    </View>
  )
})

/** The mascot pets that keep Hermes company in the TUI and desktop (Petdex gallery). */
export default function PetsScreen() {
  const t = useT()
  const { c } = useTheme()
  const profile = useProfile()
  const q = useRpc(['pets', profile], 'pet.gallery', { profile, localOnly: false }, { staleTime: 5 * 60_000 })
  const [filter, setFilter] = useState<'featured' | 'installed' | 'all'>('featured')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const pets = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (q.data?.pets ?? []).filter(
      (p: PetGalleryEntry) =>
        (filter === 'all' || (filter === 'installed' ? p.installed : p.curated || p.installed)) &&
        (!needle || p.displayName.toLowerCase().includes(needle) || p.slug.includes(needle)),
    )
  }, [q.data, filter, search])

  const select = async (slug: string) => {
    setBusy(slug)
    try {
      await rpc().request('pet.select', { slug, profile }, { timeoutMs: 120_000 })
      toast(t('Pet selected'), 'success')
      await queryClient.invalidateQueries({ queryKey: ['pets', profile] })
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: t('Pets') }} />
      <View style={{ padding: space.lg, gap: space.sm }}>
        <TextField placeholder={t('Search {n} pets', { n: q.data?.pets?.length ?? 0 })} value={search} onChangeText={setSearch} />
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'featured', label: t('Featured') },
            { value: 'installed', label: t('Installed') },
            { value: 'all', label: t('All') },
          ]}
        />
        {q.data?.enabled ? (
          <Button
            size="sm"
            variant="secondary"
            label={t('Turn the pet off')}
            onPress={async () => {
              await rpc().request('pet.disable', { profile }).catch(toastError)
              await queryClient.invalidateQueries({ queryKey: ['pets', profile] })
            }}
            style={{ alignSelf: 'flex-start' }}
          />
        ) : null}
        {q.isLoading ? <Loading /> : null}
        {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
      </View>
      <FlatList
        data={pets}
        keyExtractor={(p) => p.slug}
        numColumns={3}
        initialNumToRender={12}
        windowSize={5}
        columnWrapperStyle={{ gap: space.sm }}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.sm }}
        ListEmptyComponent={!q.isLoading ? <EmptyState icon={PawPrint} title={t('No pets found')} /> : null}
        renderItem={({ item: p }) => {
          const on = q.data?.active === p.slug && !!q.data?.enabled
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={p.displayName}
              onPress={() => select(p.slug)}
              style={[styles.tile, { backgroundColor: c.surface, borderColor: on ? c.accent : c.border, opacity: busy && busy !== p.slug ? 0.6 : 1 }]}
            >
              <PetThumb slug={p.slug} />
              <Text variant="small" weight="medium" numberOfLines={1}>
                {p.displayName}
              </Text>
              <View style={{ flexDirection: 'row', gap: 4, minHeight: 18 }}>
                {p.installed ? <Badge label={t('installed')} /> : null}
                {on ? <Check size={16} color={c.accentText} /> : null}
              </View>
            </Pressable>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  tile: { flex: 1, maxWidth: '32%', borderWidth: 1, borderRadius: radius.lg, padding: space.sm, gap: 4, alignItems: 'center' },
})
