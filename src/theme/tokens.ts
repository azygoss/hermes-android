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

// Dark OLED base (ui-ux-pro-max "Dark Mode (OLED)") with the Hermes gold accent
// from the default skin (ui_accent #FFBF00). Muted text is ~7:1 on bg.
export const dark: Palette = {
  bg: '#0B0B0F',
  surface: '#14141A',
  surfaceAlt: '#1B1B23',
  elevated: '#202029',
  border: '#272731',
  borderStrong: '#3A3A47',
  text: '#F4F2EC',
  textMuted: '#A8A499',
  textFaint: '#77736A',
  accent: '#FFBF00',
  accentText: '#FFCA33',
  onAccent: '#1A1300',
  accentSoft: 'rgba(255,191,0,0.14)',
  success: '#5BD17A',
  successSoft: 'rgba(91,209,122,0.14)',
  danger: '#FF6B66',
  dangerSoft: 'rgba(255,107,102,0.14)',
  warn: '#FFB454',
  warnSoft: 'rgba(255,180,84,0.14)',
  info: '#7CB7FF',
  infoSoft: 'rgba(124,183,255,0.14)',
  userBubble: '#262019',
  codeBg: '#101015',
  overlay: 'rgba(0,0,0,0.6)',
}

export const light: Palette = {
  bg: '#FAF8F3',
  surface: '#FFFFFF',
  surfaceAlt: '#F2EFE7',
  elevated: '#FFFFFF',
  border: '#E5E1D6',
  borderStrong: '#CFC9BA',
  text: '#1B1A17',
  textMuted: '#5F5B52',
  textFaint: '#8A857A',
  accent: '#E0A400',
  accentText: '#8A5D00',
  onAccent: '#1A1300',
  accentSoft: 'rgba(224,164,0,0.14)',
  success: '#1E8A3C',
  successSoft: 'rgba(30,138,60,0.10)',
  danger: '#C62828',
  dangerSoft: 'rgba(198,40,40,0.10)',
  warn: '#A65D00',
  warnSoft: 'rgba(166,93,0,0.10)',
  info: '#1F5FAD',
  infoSoft: 'rgba(31,95,173,0.10)',
  userBubble: '#F3E9CF',
  codeBg: '#F2EFE7',
  overlay: 'rgba(20,18,12,0.45)',
}

export const accents: Record<string, { dark: string; light: string; darkText: string; lightText: string }> = {
  gold: { dark: '#FFBF00', light: '#E0A400', darkText: '#FFCA33', lightText: '#8A5D00' },
  azure: { dark: '#5AA9FF', light: '#1F6FD1', darkText: '#7CB7FF', lightText: '#1A5CAD' },
  emerald: { dark: '#3DDC84', light: '#1E9E5A', darkText: '#5BE39A', lightText: '#16774A' },
  violet: { dark: '#B38CFF', light: '#7A4CE0', darkText: '#C2A3FF', lightText: '#5E35B8' },
  coral: { dark: '#FF7A6B', light: '#E0523F', darkText: '#FF9486', lightText: '#AD3A2A' },
}

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const

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
  title: { fontSize: 17, lineHeight: 24 },
  h2: { fontSize: 20, lineHeight: 28 },
  h1: { fontSize: 28, lineHeight: 34 },
} as const

/** Minimum touch target (ui-ux-pro-max: 44x44, Material: 48dp). */
export const HIT = 48

export const motion = { fast: 150, base: 220, slow: 320 } as const
