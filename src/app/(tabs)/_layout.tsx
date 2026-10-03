import { Tabs } from 'expo-router'
import { Bot, CalendarClock, History, LayoutGrid, type LucideIcon, MessageSquare } from '@/components/icons'
import { type ColorValue, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useT } from '@/i18n'
import { haptic } from '@/lib/haptics'
import { useChat } from '@/store/chat'
import { font, radius, useTheme } from '@/theme'

export default function TabsLayout() {
  const t = useT()
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const pending = useChat((s) => s.requests.length)
  const icon = (Icon: LucideIcon) =>
    function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
      // The active tab sits on a soft accent pill, so the state does not rest on colour alone.
      return (
        <View style={[styles.pill, focused && { backgroundColor: c.accentSoft }]}>
          <Icon color={String(color)} size={22} strokeWidth={focused ? 2 : 1.75} />
        </View>
      )
    }
  return (
    <Tabs
      screenListeners={{ tabPress: () => haptic('select') }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accentText,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.border, height: 64 + insets.bottom, paddingTop: 8 },
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11, marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="chat"
        options={{
          title: t('Chat'),
          tabBarIcon: icon(MessageSquare),
          tabBarBadge: pending ? pending : undefined,
          tabBarBadgeStyle: { backgroundColor: c.accent, color: c.onAccent },
        }}
      />
      <Tabs.Screen
        name="sessions"
        options={{ title: t('Sessions'), tabBarIcon: icon(History) }}
      />
      <Tabs.Screen name="agent" options={{ title: t('Agent'), tabBarIcon: icon(Bot) }} />
      <Tabs.Screen
        name="automate"
        options={{ title: t('Automate'), tabBarIcon: icon(CalendarClock) }}
      />
      <Tabs.Screen name="more" options={{ title: t('More'), tabBarIcon: icon(LayoutGrid) }} />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  pill: { width: 56, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
})

export { RouteError as ErrorBoundary } from '@/components/RouteError'
