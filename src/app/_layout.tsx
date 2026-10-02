import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter'
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useFonts } from 'expo-font'
import { DarkTheme, DefaultTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SystemUI from 'expo-system-ui'
import { useEffect, useState } from 'react'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { AppLock } from '@/components/AppLock'
import { GatewayBridge } from '@/components/GatewayBridge'
import { DialogHost, ToastHost } from '@/components/ui/Dialogs'
import { TurnEffects } from '@/components/chat/TurnEffects'
import { useT } from '@/i18n'
import { persistOptions, queryClient } from '@/lib/query'
import { useConnections } from '@/store/connections'
import { useSettings } from '@/store/settings'
import { AppThemeProvider, font, useTheme } from '@/theme'

SplashScreen.preventAutoHideAsync().catch(() => {})

function useHydrated() {
  const [ok, setOk] = useState(() => useConnections.persist.hasHydrated() && useSettings.persist.hasHydrated())
  useEffect(() => {
    const check = () => setOk(useConnections.persist.hasHydrated() && useSettings.persist.hasHydrated())
    const a = useConnections.persist.onFinishHydration(check)
    const b = useSettings.persist.onFinishHydration(check)
    check()
    return () => {
      a()
      b()
    }
  }, [])
  return ok
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  })
  const hydrated = useHydrated()
  const ready = fontsLoaded && hydrated

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {})
  }, [ready])

  if (!ready) return null

  return (
    <AppThemeProvider>
      <AppShell />
    </AppThemeProvider>
  )
}

function AppShell() {
  const { c, isDark } = useTheme()
  // Restored data belongs to one backend; a different active connection discards it.
  const cacheOwner = useConnections((s) => {
    const a = s.connections.find((x) => x.id === s.activeId)
    return a ? `${a.id}|${a.baseUrl}|${a.authMode}` : 'none'
  })
  const t = useT()

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(c.bg)
  }, [c.bg])

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      primary: c.accent,
      background: c.bg,
      card: c.bg,
      text: c.text,
      border: c.border,
      notification: c.accent,
    },
  }

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={{ ...persistOptions, buster: cacheOwner }}>
          <ThemeProvider value={navTheme}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <GatewayBridge />
            <TurnEffects />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: c.bg },
                headerTintColor: c.text,
                headerTitleStyle: { fontFamily: font.semibold, fontSize: 17 },
                headerShadowVisible: false,
                contentStyle: { backgroundColor: c.bg },
                animation: 'slide_from_right',
                headerBackButtonDisplayMode: 'minimal',
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="connect" options={{ title: t('Connect to Hermes') }} />
            </Stack>
            <DialogHost />
            <ToastHost />
            <AppLock />
          </ThemeProvider>
        </PersistQueryClientProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  )
}

export { RouteError as ErrorBoundary } from '@/components/RouteError'
