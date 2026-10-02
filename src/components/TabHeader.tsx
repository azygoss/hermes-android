import type { ReactNode } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Text } from '@/components/ui'
import { space, useTheme } from '@/theme'

export function TabHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View
      style={{
        paddingTop: insets.top + space.sm,
        paddingHorizontal: space.lg,
        paddingBottom: space.sm,
        backgroundColor: c.bg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text variant="h1" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  )
}
