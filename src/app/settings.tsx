import * as Notifications from 'expo-notifications'
import { Stack } from 'expo-router'
import { Bell, Brain, Fingerprint, Languages, Mic, Moon, Palette, Send, Smartphone, Type, Vibrate, Wrench } from '@/components/icons'
import { Platform, Pressable, View } from 'react-native'

import { appLockSupported, authenticate, canUseAppLock } from '@/components/AppLock'
import { Screen, Section, Segmented, Text, toast, ToggleRow } from '@/components/ui'
import { useT } from '@/i18n'
import { speak } from '@/lib/voice'
import { useSettings, type Language, type ThemeMode } from '@/store/settings'
import { accents, space, useTheme } from '@/theme'

function Label({ icon: Icon, text }: { icon: typeof Moon; text: string }) {
  const { c } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <Icon size={16} color={c.textMuted} strokeWidth={1.75} />
      <Text weight="medium">{text}</Text>
    </View>
  )
}

export default function SettingsScreen() {
  const t = useT()
  const { c, isDark } = useTheme()
  const s = useSettings()

  return (
    <Screen>
      <Stack.Screen options={{ title: t('Settings') }} />
      <Section title={t('Appearance')}>
        <View style={{ padding: space.lg, gap: space.md }}>
          <Label icon={Moon} text={t('Theme')} />
          <Segmented<ThemeMode>
            value={s.themeMode}
            onChange={(v) => s.set({ themeMode: v })}
            options={[
              { value: 'system', label: t('System') },
              { value: 'dark', label: t('Dark') },
              { value: 'light', label: t('Light') },
            ]}
          />
          <Label icon={Palette} text={t('Accent colour')} />
          <View style={{ flexDirection: 'row', gap: space.md, flexWrap: 'wrap' }}>
            {Object.entries(accents).map(([name, a]) => {
              const on = s.accent === name && !s.useSkinAccent
              return (
                <Pressable
                  key={name}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={name}
                  onPress={() => s.set({ accent: name, useSkinAccent: false })}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: isDark ? a.dark : a.light,
                    borderWidth: on ? 3 : 0,
                    borderColor: c.text,
                  }}
                />
              )
            })}
          </View>
          <Label icon={Type} text={t('Text size')} />
          <Segmented
            value={String(s.fontScale)}
            onChange={(v) => s.set({ fontScale: Number(v) })}
            options={[
              { value: '0.9', label: 'A-' },
              { value: '1', label: 'A' },
              { value: '1.1', label: 'A+' },
              { value: '1.2', label: 'A++' },
            ]}
          />
        </View>
        <ToggleRow
          icon={Palette}
          title={t("Use the backend's Hermes skin colour")}
          subtitle={t('Follows /skin on the backend')}
          value={s.useSkinAccent}
          onChange={(v) => s.set({ useSkinAccent: v })}
          last
        />
      </Section>

      <Section title={t('Language')}>
        <View style={{ padding: space.lg, gap: space.md }}>
          <Label icon={Languages} text={t('App language')} />
          <Segmented<Language>
            value={s.language}
            onChange={(v) => s.set({ language: v })}
            options={[
              { value: 'system', label: t('System') },
              { value: 'en', label: 'English' },
              { value: 'tr', label: 'Türkçe' },
            ]}
          />
        </View>
      </Section>

      <Section title={t('Chat')}>
        <ToggleRow
          icon={Brain}
          title={t("Show the model's reasoning")}
          value={s.showReasoning}
          onChange={(v) => s.set({ showReasoning: v })}
        />
        <ToggleRow
          icon={Wrench}
          title={t('Expand tool calls')}
          subtitle={t('Show tool input and output without tapping')}
          value={s.expandTools}
          onChange={(v) => s.set({ expandTools: v })}
        />
        <ToggleRow icon={Send} title={t('Enter sends the message')} value={s.sendOnEnter} onChange={(v) => s.set({ sendOnEnter: v })} />
        <ToggleRow icon={Vibrate} title={t('Haptic feedback')} value={s.haptics} onChange={(v) => s.set({ haptics: v })} last />
      </Section>

      <Section title={t('Voice')}>
        <ToggleRow
          icon={Mic}
          title={t('Read replies aloud')}
          subtitle={t('Speak each finished reply in the open chat')}
          value={s.autoSpeak}
          onChange={(v) => s.set({ autoSpeak: v })}
        />
        <View style={{ padding: space.lg, gap: space.md }}>
          <Label icon={Smartphone} text={t('Voice engine')} />
          <Segmented
            value={s.ttsEngine}
            onChange={(v) => s.set({ ttsEngine: v })}
            options={[
              { value: 'hermes', label: t('Hermes (backend TTS)') },
              { value: 'device', label: t('This phone') },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => speak(t('Hello! This is how Hermes sounds.'))}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text tone="accent" weight="medium">
              {t('Play a sample')}
            </Text>
          </Pressable>
        </View>
      </Section>

      {appLockSupported ? (
        <Section title={t('Security')} footer={t('Hermes can run commands on your server, so anyone holding your unlocked phone can too.')}>
          <ToggleRow
            icon={Fingerprint}
            title={t('Lock the app')}
            subtitle={t('Fingerprint or screen lock when opening, and after 30 seconds away')}
            value={s.appLock}
            onChange={async (on) => {
              if (on && !(await canUseAppLock())) return toast(t('Set up a screen lock on this phone first.'), 'warn')
              // Confirm with the lock itself, so turning it on cannot shut you out.
              if (await authenticate()) s.set({ appLock: on })
            }}
            last
          />
        </Section>
      ) : null}
      <Section title={t('Notifications')}>
        <ToggleRow
          icon={Bell}
          title={t('Notify when a reply finishes in the background')}
          subtitle={t('Also when the agent needs an approval or an answer')}
          value={s.notifyOnComplete}
          onChange={async (v) => {
            s.set({ notifyOnComplete: v })
            if (v && Platform.OS !== 'web') {
              const perm = await Notifications.requestPermissionsAsync()
              if (!perm.granted) toast(t('Allow notifications for Hermes in Android settings.'), 'warn')
            }
          }}
          last
        />
      </Section>
    </Screen>
  )
}
