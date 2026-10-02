import { Text as RNText, type TextProps, type TextStyle } from 'react-native'

import { font, type Palette, type as typeScale, useTheme } from '@/theme'

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
  const { c, fontScale: scale } = useTheme()
  const w = weight ?? (variant === 'h1' || variant === 'h2' ? 'bold' : variant === 'title' ? 'semibold' : 'regular')
  const ts = typeScale[variant]
  const s: TextStyle = {
    color: toneColor(c, tone),
    fontFamily: mono ? (w === 'regular' ? font.mono : font.monoMedium) : font[w],
    fontSize: ts.fontSize * scale,
    lineHeight: ts.lineHeight * scale,
    letterSpacing: 'letterSpacing' in ts ? ts.letterSpacing : undefined,
    textAlign: center ? 'center' : undefined,
  }
  return <RNText maxFontSizeMultiplier={1.6} style={[s, style]} {...rest} />
}

function toneColor(c: Palette, tone: TextTone) {
  switch (tone) {
    case 'muted':
      return c.textMuted
    case 'faint':
      return c.textFaint
    case 'accent':
      return c.accentText
    case 'danger':
      return c.danger
    case 'success':
      return c.success
    case 'warn':
      return c.warn
    case 'info':
      return c.info
    case 'onAccent':
      return c.onAccent
    default:
      return c.text
  }
}
