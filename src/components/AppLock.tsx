import * as LocalAuthentication from 'expo-local-authentication'
import { Fingerprint } from 'lucide-react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Platform, StyleSheet, View } from 'react-native'

import { HermesMark } from '@/components/HermesMark'
import { Button, Text } from '@/components/ui'
import { t, useT } from '@/i18n'
import { useSettings } from '@/store/settings'
import { space, useTheme } from '@/theme'

/** Background time after which the app asks again. Short trips (share sheet, camera) do not lock. */
const RELOCK_AFTER_MS = 30_000

export const appLockSupported = Platform.OS !== 'web'

/** Whether this device has any screen lock (biometric or PIN/pattern) the app can ask for. */
export async function canUseAppLock() {
  if (!appLockSupported) return false
  return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE
}

export async function authenticate() {
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: t('Unlock Hermes'),
    cancelLabel: t('Cancel'),
    biometricsSecurityLevel: 'weak',
  })
  return res.success
}

/** Covers the app until the user passes the device lock (Settings → Lock the app). */
export function AppLock() {
  const enabled = useSettings((s) => s.appLock)
  const { c } = useTheme()
  const t = useT()
  const [locked, setLocked] = useState(enabled && appLockSupported)
  const [prompting, setPrompting] = useState(false)
  const leftAt = useRef<number | null>(null)

  const unlock = useCallback(async () => {
    setPrompting(true)
    try {
      if (await authenticate()) setLocked(false)
    } finally {
      setPrompting(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled || !appLockSupported) {
      setLocked(false)
      return
    }
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') leftAt.current = Date.now()
      else if (state === 'active' && leftAt.current != null) {
        if (Date.now() - leftAt.current > RELOCK_AFTER_MS) setLocked(true)
        leftAt.current = null
      }
    })
    return () => sub.remove()
  }, [enabled])

  useEffect(() => {
    if (locked && !prompting) void unlock()
    // Prompt once per lock; the button retries after a cancel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked])

  if (!locked) return null
  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap, { backgroundColor: c.bg }]} accessibilityViewIsModal>
      <HermesMark size={56} />
      <Text variant="h2" center>
        {t('Hermes is locked')}
      </Text>
      <Text tone="muted" center style={{ maxWidth: 280 }}>
        {t('Unlock with your fingerprint or screen lock.')}
      </Text>
      <Button icon={Fingerprint} label={t('Unlock')} onPress={unlock} loading={prompting} style={{ marginTop: space.md }} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl, zIndex: 100 },
})
