import { Tabs } from 'expo-router'
import { Bot, CalendarClock, History, LayoutGrid, MessageSquare } from '@/components/icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useT } from '@/i18n'
import { useChat } from '@/store/chat'
import { font, useTheme } from '@/theme'

export default function TabsLayout() {
  const t = useT()
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const pending = useChat((s) => s.requests.length)
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accentText,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.border, height: 60 + insets.bottom, paddingTop: 6 },
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="chat"
        options={{
          title: t('Chat'),
          tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} />,
          tabBarBadge: pending ? pending : undefined,
          tabBarBadgeStyle: { backgroundColor: c.accent, color: c.onAccent },
        }}
      />
      <Tabs.Screen
        name="sessions"
        options={{ title: t('Sessions'), tabBarIcon: ({ color, size }) => <History color={color} size={size} /> }}
      />
      <Tabs.Screen name="agent" options={{ title: t('Agent'), tabBarIcon: ({ color, size }) => <Bot color={color} size={size} /> }} />
      <Tabs.Screen
        name="automate"
        options={{ title: t('Automate'), tabBarIcon: ({ color, size }) => <CalendarClock color={color} size={size} /> }}
      />
      <Tabs.Screen name="more" options={{ title: t('More'), tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} /> }} />
    </Tabs>
  )
}
