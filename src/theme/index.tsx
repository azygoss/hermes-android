import { useMemo } from 'react'
import { useColorScheme } from 'react-native'

import { useRuntime } from '@/lib/hermes'
import { useSettings } from '@/store/settings'

import { accents, dark, light, type Palette } from './tokens'

export * from './tokens'

function hexToRgb(hex: string) {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
}

function luminance(hex: string) {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0.5
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

function withAlpha(hex: string, alpha: number) {
  const rgb = hexToRgb(hex)
  return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})` : hex
}

export function useTheme() {
  const scheme = useColorScheme()
  const { themeMode, accent, useSkinAccent } = useSettings()
  const skinAccent = useRuntime((s) => (s.ready?.skin as { colors?: Record<string, string> } | undefined)?.colors?.ui_accent)
  const isDark = themeMode === 'system' ? scheme !== 'light' : themeMode === 'dark'

  const c = useMemo<Palette>(() => {
    const base = isDark ? dark : light
    const preset = accents[accent] ?? accents.gold
    let acc = isDark ? preset.dark : preset.light
    let accText = isDark ? preset.darkText : preset.lightText
    if (useSkinAccent && skinAccent && hexToRgb(skinAccent)) {
      acc = skinAccent
      // Only use the skin colour for text when it stays readable on the background.
      accText = contrast(skinAccent, base.bg) >= 4.5 ? skinAccent : accText
    }
    const onAccent = luminance(acc) > 0.35 ? '#141008' : '#FFFFFF'
    return { ...base, accent: acc, accentText: accText, onAccent, accentSoft: withAlpha(acc, isDark ? 0.14 : 0.12) }
  }, [isDark, accent, useSkinAccent, skinAccent])

  return { c, isDark }
}
