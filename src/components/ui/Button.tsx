import type { LucideIcon } from 'lucide-react-native'
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'

import { HIT, radius, space, useTheme } from '@/theme'

import { Text } from './Text'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerGhost'

interface Props {
  label: string
  onPress?: () => void
  variant?: ButtonVariant
  size?: 'md' | 'sm'
  icon?: LucideIcon
  loading?: boolean
  disabled?: boolean
  full?: boolean
  style?: StyleProp<ViewStyle>
  accessibilityHint?: string
}

export function Button({ label, onPress, variant = 'primary', size = 'md', icon: Icon, loading, disabled, full, style, accessibilityHint }: Props) {
  const { c } = useTheme()
  const palette = {
    primary: { bg: c.accent, fg: c.onAccent, border: c.accent },
    secondary: { bg: c.surfaceAlt, fg: c.text, border: c.border },
    ghost: { bg: 'transparent', fg: c.accentText, border: 'transparent' },
    danger: { bg: c.danger, fg: '#FFFFFF', border: c.danger },
    dangerGhost: { bg: 'transparent', fg: c.danger, border: 'transparent' },
  }[variant]
  const inactive = disabled || loading
  const height = size === 'md' ? HIT : 40
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={inactive ? undefined : onPress}
      android_ripple={{ color: c.accentSoft, borderless: false }}
      hitSlop={size === 'sm' ? 4 : 0}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: height,
          paddingHorizontal: size === 'md' ? space.lg : space.md,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: inactive ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: full ? 'stretch' : 'auto',
        },
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator size="small" color={palette.fg} />
        ) : Icon ? (
          <Icon size={size === 'md' ? 18 : 16} color={palette.fg} strokeWidth={2.2} />
        ) : null}
        <Text variant={size === 'md' ? 'body' : 'small'} weight="semibold" style={{ color: palette.fg }} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  )
}

interface IconButtonProps {
  icon: LucideIcon
  label: string
  onPress?: () => void
  color?: string
  size?: number
  disabled?: boolean
  active?: boolean
  filled?: boolean
  style?: StyleProp<ViewStyle>
}

/** Icon-only control with a 48dp target and a mandatory accessibility label. */
export function IconButton({ icon: Icon, label, onPress, color, size = 22, disabled, active, filled, style }: IconButtonProps) {
  const { c } = useTheme()
  const fg = color ?? (filled ? c.onAccent : active ? c.accentText : c.text)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!active }}
      onPress={disabled ? undefined : onPress}
      android_ripple={{ color: c.accentSoft, borderless: true, radius: HIT / 2 }}
      style={({ pressed }) => [
        styles.icon,
        filled && { backgroundColor: c.accent },
        active && !filled && { backgroundColor: c.accentSoft },
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        style,
      ]}
    >
      <Icon size={size} color={fg} strokeWidth={2} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icon: {
    width: HIT,
    height: HIT,
    borderRadius: HIT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
