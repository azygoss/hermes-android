import { Text as RNText, type TextProps, type TextStyle } from 'react-native'

import { useSettings } from '@/store/settings'
import { font, type as typeScale, useTheme } from '@/theme'

export type TextVariant = keyof typeof typeScale
export type TextTone = 'default' | 'muted' | 'faint' | 'accent' | 'danger' | 'success' | 'warn' | 'info' | 'onAccent'

export interface Props extends TextProps {
  variant?: TextVariant
  tone?: TextTone
  weight?: 'regular' | 'medium' | 'semibold' | 'bold'
  mono?: boolean
  center?: boolean
}

export function Text({ variant = 'body', tone = 'default', weight, mono, center, style, ...rest }: Props) {
  const { c } = useTheme()
  const scale = useSettings((s) => s.fontScale)
  const colors: Record<TextTone, string> = {
    default: c.text,
    muted: c.textMuted,
    faint: c.textFaint,
    accent: c.accentText,
    danger: c.danger,
    success: c.success,
    warn: c.warn,
    info: c.info,
    onAccent: c.onAccent,
  }
  const w = weight ?? (variant === 'h1' || variant === 'h2' ? 'bold' : variant === 'title' ? 'semibold' : 'regular')
  const ts = typeScale[variant]
  const s: TextStyle = {
    color: colors[tone],
    fontFamily: mono ? (w === 'regular' ? font.mono : font.monoMedium) : font[w],
    fontSize: ts.fontSize * scale,
    lineHeight: ts.lineHeight * scale,
    textAlign: center ? 'center' : undefined,
  }
  return <RNText maxFontSizeMultiplier={1.6} style={[s, style]} {...rest} />
}
