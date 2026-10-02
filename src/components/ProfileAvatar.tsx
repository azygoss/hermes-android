import { useQuery } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { View } from 'react-native'

import { Text } from '@/components/ui'
import { rpc, useRuntime } from '@/lib/hermes'
import { useTheme } from '@/theme'

export function ProfileAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const { c } = useTheme()
  const open = useRuntime((s) => s.state === 'open')
  const avatar = useQuery({
    queryKey: ['profile-avatar', name],
    enabled: open,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await rpc().request('profiles.get_asset', { name, asset: 'avatar' })
      if (!res.found || !res.data) return null
      return res.data.startsWith('data:') ? res.data : `data:${res.mime ?? 'image/png'};base64,${res.data}`
    },
  })
  if (avatar.data)
    return <Image source={{ uri: avatar.data }} style={{ width: size, height: size, borderRadius: size / 2 }} accessibilityLabel={name} />
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text weight="bold" style={{ color: c.accentText, fontSize: size * 0.4, lineHeight: size * 0.5 }}>
        {name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  )
}
