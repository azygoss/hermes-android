import { useQuery } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useState } from 'react'
import { Modal, Pressable, View } from 'react-native'

import { useT } from '@/i18n'
import { rest } from '@/lib/hermes'
import { radius, useTheme } from '@/theme'

/** Shows an image the agent produced: a URL, a data URL, or a file under the Hermes home (via /api/media). */
export function RemoteImage({ src, size = 180 }: { src: string; size?: number }) {
  const { c } = useTheme()
  const t = useT()
  const [open, setOpen] = useState(false)
  const local = src.startsWith('/')
  const { data } = useQuery({
    queryKey: ['media', src],
    enabled: local,
    staleTime: Infinity,
    queryFn: async () =>
      (await rest().get<{ data_url?: string }>('/api/media', { query: { path: src }, noProfile: true })).data_url ?? null,
  })
  const uri = local ? data : src
  if (!uri) return <View style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: c.surfaceAlt }} />
  return (
    <>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel={t('Open image')} onPress={() => setOpen(true)}>
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: c.surfaceAlt }}
          contentFit="cover"
          transition={150}
        />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' }} onPress={() => setOpen(false)} accessibilityLabel={t('Close')}>
          <Image source={{ uri }} style={{ flex: 1 }} contentFit="contain" />
        </Pressable>
      </Modal>
    </>
  )
}
