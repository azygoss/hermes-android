import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistStorage } from '@/lib/storage'

export type ThemeMode = 'system' | 'dark' | 'light'
export type Language = 'system' | 'en' | 'tr'

export interface Settings {
  themeMode: ThemeMode
  accent: string
  /** Take the accent from the backend's active Hermes skin. */
  useSkinAccent: boolean
  language: Language
  showReasoning: boolean
  expandTools: boolean
  haptics: boolean
  sendOnEnter: boolean
  /** Read finished replies aloud. */
  autoSpeak: boolean
  /** "hermes" = backend TTS (/api/audio/speak), "device" = Android TTS. */
  ttsEngine: 'hermes' | 'device'
  notifyOnComplete: boolean
  fontScale: number
  /** Ask for the fingerprint / screen lock when the app opens or comes back after a while. */
  appLock: boolean
  /** Last models picked in the chat model picker, newest first. */
  recentModels: { provider: string; model: string }[]
  /** Run a foreground service while the agent works, so the connection survives the background. */
  keepAlive: boolean
}

interface SettingsState extends Settings {
  set: (patch: Partial<Settings>) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      accent: 'gold',
      useSkinAccent: false,
      language: 'system',
      showReasoning: true,
      expandTools: false,
      haptics: true,
      sendOnEnter: false,
      autoSpeak: false,
      ttsEngine: 'hermes',
      notifyOnComplete: true,
      fontScale: 1,
      appLock: false,
      recentModels: [],
      keepAlive: true,
      set: (patch) => set(patch),
    }),
    { name: 'hermes.settings', storage: persistStorage, version: 1 },
  ),
)
