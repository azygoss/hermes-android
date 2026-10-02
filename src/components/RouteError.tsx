import * as Clipboard from 'expo-clipboard'
import { router, type ErrorBoundaryProps } from 'expo-router'
import { ScrollView, View } from 'react-native'

import { HermesMark } from '@/components/HermesMark'
import { Button, Text } from '@/components/ui'
import { useT } from '@/i18n'
import { space, useTheme } from '@/theme'

/**
 * Shown instead of a blank screen when a screen throws while rendering. The root boundary sits
 * outside the providers, so this reads only context defaults (no safe-area hook).
 */
export function RouteError({ error, retry }: ErrorBoundaryProps) {
  const t = useT()
  const { c } = useTheme()
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: space.md, padding: space.xl, paddingTop: 64 }}
    >
      <HermesMark size={40} color={c.textFaint} />
      <Text variant="h2">{t('This screen ran into a problem')}</Text>
      <Text tone="muted">{t('The rest of the app is fine. Try again, or go back to the chat.')}</Text>
      <View style={{ borderLeftWidth: 2, borderLeftColor: c.border, paddingLeft: space.md }}>
        <Text variant="small" tone="faint" mono selectable numberOfLines={6}>
          {error.message}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', marginTop: space.sm }}>
        <Button label={t('Try again')} onPress={() => void retry()} />
        <Button label={t('Go to chat')} variant="secondary" onPress={() => router.replace('/chat')} />
        <Button
          label={t('Copy details')}
          variant="ghost"
          onPress={() => void Clipboard.setStringAsync(`${error.name}: ${error.message}\n${error.stack ?? ''}`)}
        />
      </View>
    </ScrollView>
  )
}
