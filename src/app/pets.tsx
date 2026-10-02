import { Image } from 'expo-image'
import { Stack } from 'expo-router'
import { Check, PawPrint } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { Badge, Button, EmptyState, ErrorState, Loading, Screen, Text, toast, toastError } from '@/components/ui'
import { useT } from '@/i18n'
import { useRpc } from '@/lib/hooks'
import { rpc, useProfile } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { radius, space, useTheme } from '@/theme'

function PetThumb({ slug }: { slug: string }) {
  const profile = useProfile()
  const q = useRpc(['pets', 'thumb', slug], 'pet.thumb', { slug, profile }, { staleTime: Infinity })
  const src = q.data?.dataUri
  return src ? <Image source={{ uri: src }} style={{ width: 72, height: 72 }} contentFit="contain" /> : <PawPrint size={32} color="#888" />
}

/** The mascot pets that keep Hermes company in the TUI and desktop. */
export default function PetsScreen() {
  const t = useT()
  const { c } = useTheme()
  const profile = useProfile()
  const q = useRpc(['pets', profile], 'pet.gallery', { profile, localOnly: false })
  const [busy, setBusy] = useState<string | null>(null)

  const select = async (slug: string) => {
    setBusy(slug)
    try {
      await rpc().request('pet.select', { slug, profile }, { timeoutMs: 120_000 })
      toast(t('Pet selected'), 'success')
      await queryClient.invalidateQueries({ queryKey: ['pets'] })
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Stack.Screen options={{ title: t('Pets') }} />
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
      {q.data?.enabled ? (
        <Button
          variant="secondary"
          label={t('Turn the pet off')}
          onPress={async () => {
            await rpc().request('pet.disable', { profile }).catch(toastError)
            await queryClient.invalidateQueries({ queryKey: ['pets'] })
          }}
        />
      ) : null}
      <View style={styles.grid}>
        {(q.data?.pets ?? []).map((p) => {
          const on = q.data?.active === p.slug && q.data.enabled
          return (
            <Pressable
              key={p.slug}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => select(p.slug)}
              style={[
                styles.tile,
                { backgroundColor: c.surface, borderColor: on ? c.accent : c.border, opacity: busy && busy !== p.slug ? 0.6 : 1 },
              ]}
            >
              <PetThumb slug={p.slug} />
              <Text weight="medium" numberOfLines={1}>
                {p.displayName}
              </Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {p.installed ? <Badge label={t('installed')} /> : null}
                {on ? <Check size={16} color={c.accentText} /> : null}
              </View>
            </Pressable>
          )
        })}
      </View>
      {!q.isLoading && !q.data?.pets?.length ? <EmptyState icon={PawPrint} title={t('No pets found')} /> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: '31.5%', borderWidth: 1, borderRadius: radius.lg, padding: space.sm, gap: 4, alignItems: 'center' },
})
