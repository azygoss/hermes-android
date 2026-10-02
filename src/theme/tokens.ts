export interface Palette {
  bg: string
  surface: string
  surfaceAlt: string
  elevated: string
  border: string
  borderStrong: string
  text: string
  textMuted: string
  textFaint: string
  accent: string
  /** Accent when used for text/icons on `bg` (contrast-checked). */
  accentText: string
  onAccent: string
  accentSoft: string
  success: string
  successSoft: string
  danger: string
  dangerSoft: string
  warn: string
  warnSoft: string
  info: string
  infoSoft: string
  userBubble: string
  codeBg: string
  overlay: string
}

// Warm near-black neutrals so the gold accent reads as brass rather than neon. Surfaces step up
// in small, even increments; the accent is kept for state and the one primary action per screen.
// Muted text is ~7:1 and faint text ~4.6:1 on bg.
export const dark: Palette = {
  bg: '#0D0C0B',
  surface: '#161513',
  surfaceAlt: '#1D1C19',
  elevated: '#24221F',
  border: '#2A2825',
  borderStrong: '#3D3A35',
  text: '#EDE9E2',
  textMuted: '#A7A096',
  textFaint: '#857E73',
  accent: '#E9B44C',
  accentText: '#EDBD5E',
  onAccent: '#1A1405',
  accentSoft: 'rgba(233,180,76,0.13)',
  success: '#6CC88A',
  successSoft: 'rgba(108,200,138,0.12)',
  danger: '#F07167',
  dangerSoft: 'rgba(240,113,103,0.12)',
  warn: '#E9A35A',
  warnSoft: 'rgba(233,163,90,0.12)',
  info: '#8DB4E8',
  infoSoft: 'rgba(141,180,232,0.12)',
  userBubble: '#211F1B',
  codeBg: '#121110',
  overlay: 'rgba(0,0,0,0.62)',
}

export const light: Palette = {
  bg: '#F7F5F0',
  surface: '#FFFFFF',
  surfaceAlt: '#EFECE5',
  elevated: '#FFFFFF',
  border: '#E2DED5',
  borderStrong: '#CBC5B8',
  text: '#1C1B18',
  textMuted: '#5E5A51',
  textFaint: '#7A756B',
  accent: '#C98F1C',
  accentText: '#875C08',
  onAccent: '#1A1405',
  accentSoft: 'rgba(201,143,28,0.12)',
  success: '#1E7F3B',
  successSoft: 'rgba(30,127,59,0.09)',
  danger: '#BF2E26',
  dangerSoft: 'rgba(191,46,38,0.08)',
  warn: '#995500',
  warnSoft: 'rgba(153,85,0,0.09)',
  info: '#215DA6',
  infoSoft: 'rgba(33,93,166,0.08)',
  userBubble: '#ECE7DC',
  codeBg: '#EFECE5',
  overlay: 'rgba(20,18,12,0.45)',
}

export const accents: Record<string, { dark: string; light: string; darkText: string; lightText: string }> = {
  gold: { dark: '#E9B44C', light: '#C98F1C', darkText: '#EDBD5E', lightText: '#875C08' },
  azure: { dark: '#7FA9E0', light: '#2F64A8', darkText: '#94B8E8', lightText: '#2A5A97' },
  sage: { dark: '#8DBF8F', light: '#3D7A45', darkText: '#9DCA9F', lightText: '#356B3C' },
  iris: { dark: '#A99BE0', light: '#5C4BAE', darkText: '#B8ACE6', lightText: '#53449D' },
  clay: { dark: '#DE8C6E', light: '#A9502F', darkText: '#E49C81', lightText: '#97462A' },
}

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const

export const radius = { xs: 6, sm: 8, md: 10, lg: 14, xl: 20, pill: 999 } as const

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
} as const

export const type = {
  caption: { fontSize: 12, lineHeight: 16 },
  small: { fontSize: 13, lineHeight: 18 },
  body: { fontSize: 15, lineHeight: 22 },
  bodyLg: { fontSize: 16, lineHeight: 24 },
  title: { fontSize: 17, lineHeight: 24, letterSpacing: -0.2 },
  h2: { fontSize: 21, lineHeight: 28, letterSpacing: -0.3 },
  h1: { fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
} as const

/** Minimum touch target (ui-ux-pro-max: 44x44, Material: 48dp). */
export const HIT = 48

/** Widest a column of text or controls gets on tablets and unfolded phones; wider lines read badly. */
export const CONTENT_MAX = 760

export const centered = { width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center' } as const

export const motion = { fast: 150, base: 220, slow: 320 } as const
