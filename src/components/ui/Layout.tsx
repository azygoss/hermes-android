import type { LucideIcon } from 'lucide-react-native'
import { ChevronRight } from 'lucide-react-native'
import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useT } from '@/i18n'
import { centered, HIT, radius, space, useTheme } from '@/theme'

import { Button } from './Button'
import { Text } from './Text'

interface ScreenProps {
  children: ReactNode
  scroll?: boolean
  refreshing?: boolean
  onRefresh?: () => void
  padded?: boolean
  bottomInset?: boolean
  style?: StyleProp<ViewStyle>
}

export function Screen({ children, scroll = true, refreshing, onRefresh, padded = true, bottomInset = true, style }: ScreenProps) {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const pad = { padding: padded ? space.lg : 0, paddingBottom: (padded ? space.lg : 0) + (bottomInset ? insets.bottom : 0) }
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: c.bg }, pad, style]}>{children}</View>
  return (
    <KeyboardAwareScrollView
      bottomOffset={space.xl}
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[pad, centered, { gap: space.lg }, style]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={c.accent}
            colors={[c.accent]}
            progressBackgroundColor={c.surface}
          />
        ) : undefined
      }
    >
      {children}
    </KeyboardAwareScrollView>
  )
}

export function Section({
  title,
  action,
  children,
  footer,
  style,
  plain,
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  footer?: string
  style?: StyleProp<ViewStyle>
  /** Edge-to-edge rows without the card, for lists inside sheets. */
  plain?: boolean
}) {
  const { c } = useTheme()
  return (
    <View style={[{ gap: plain ? 0 : space.sm }, style]}>
      {(title || action) && (
        <View style={[styles.sectionHead, plain && { paddingHorizontal: space.lg }]}>
          {title ? (
            <Text variant="small" weight="semibold" tone="muted" accessibilityRole="header">
              {title}
            </Text>
          ) : (
            <View />
          )}
          {action}
        </View>
      )}
      {plain ? children : <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>{children}</View>}
      {footer ? (
        <Text variant="caption" tone="faint" style={{ paddingHorizontal: space.xs }}>
          {footer}
        </Text>
      ) : null}
    </View>
  )
}

/** Plain bordered surface without a heading. */
export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const { c } = useTheme()
  const body = (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, padding: space.lg, gap: space.sm }, style]}>
      {children}
    </View>
  )
  if (!onPress) return body
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      android_ripple={{ color: c.accentSoft }}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      {body}
    </Pressable>
  )
}

interface RowProps {
  title: string
  subtitle?: string | null
  icon?: LucideIcon
  iconColor?: string
  value?: string | null
  right?: ReactNode
  onPress?: () => void
  onLongPress?: () => void
  chevron?: boolean
  danger?: boolean
  disabled?: boolean
  last?: boolean
  numberOfLines?: number
  mono?: boolean
  accessibilityLabel?: string
}

export function Row({
  title,
  subtitle,
  icon: Icon,
  iconColor,
  value,
  right,
  onPress,
  onLongPress,
  chevron,
  danger,
  disabled,
  last,
  numberOfLines = 2,
  mono,
  accessibilityLabel,
}: RowProps) {
  const { c } = useTheme()
  const pressable = !!(onPress || onLongPress)
  // Interactive trailing controls sit beside the pressable area, never inside it (no nested buttons).
  const splitRight = pressable && !!right
  const rule = !last ? <View style={[styles.rowRule, { left: Icon ? ROW_TEXT_INSET : space.lg, backgroundColor: c.border }]} /> : null
  const body = (
    <>
      {Icon ? <Icon size={20} color={iconColor ?? (danger ? c.danger : c.textMuted)} strokeWidth={1.75} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight="medium" tone={danger ? 'danger' : 'default'} numberOfLines={1} mono={mono}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="muted" numberOfLines={numberOfLines}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="small" tone="muted" numberOfLines={1} style={{ maxWidth: '45%' }}>
          {value}
        </Text>
      ) : null}
      {splitRight ? null : right}
      {(chevron ?? (pressable && !right)) ? <ChevronRight size={18} color={c.textFaint} strokeWidth={1.75} /> : null}
    </>
  )
  if (!pressable)
    return (
      <View style={styles.row}>
        {body}
        {rule}
      </View>
    )
  const button = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      accessibilityState={{ disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: c.surfaceAlt }}
      style={({ pressed }) => [
        styles.row,
        splitRight && { flex: 1, paddingRight: space.sm },
        { opacity: disabled ? 0.45 : 1, backgroundColor: pressed ? c.surfaceAlt : 'transparent' },
      ]}
    >
      {body}
      {splitRight ? null : rule}
    </Pressable>
  )
  if (!splitRight) return button
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {button}
      <View style={{ paddingRight: space.lg }}>{right}</View>
      {rule}
    </View>
  )
}

export function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
  icon,
  disabled,
  last,
}: {
  title: string
  subtitle?: string
  value: boolean
  onChange: (v: boolean) => void
  icon?: LucideIcon
  disabled?: boolean
  last?: boolean
}) {
  const { c } = useTheme()
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      onPress={disabled ? undefined : () => onChange(!value)}
      android_ripple={{ color: c.surfaceAlt }}
    >
      <Row
        title={title}
        subtitle={subtitle}
        icon={icon}
        last={last}
        chevron={false}
        right={
          <View importantForAccessibility="no-hide-descendants">
            <Toggle value={value} onValueChange={onChange} disabled={disabled} />
          </View>
        }
      />
    </Pressable>
  )
}

/** The app's switch: accent track, white thumb in both themes (react-native-web needs its own props). */
export function Toggle({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
  style,
}: {
  value: boolean
  onValueChange: (v: boolean) => void
  disabled?: boolean
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
}) {
  const { c, isDark } = useTheme()
  const thumb = value || !isDark ? '#FFFFFF' : '#CFC9BF'
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: c.borderStrong, true: c.accent }}
      thumbColor={thumb}
      accessibilityLabel={accessibilityLabel}
      style={style}
      {...webSwitchColors(thumb, c.accent)}
    />
  )
}

export function Badge({
  label,
  tone = 'default',
}: {
  label: string
  tone?: 'default' | 'accent' | 'success' | 'danger' | 'warn' | 'info'
}) {
  const { c } = useTheme()
  const map = {
    default: [c.surfaceAlt, c.textMuted],
    accent: [c.accentSoft, c.accentText],
    success: [c.successSoft, c.success],
    danger: [c.dangerSoft, c.danger],
    warn: [c.warnSoft, c.warn],
    info: [c.infoSoft, c.info],
  }[tone]
  return (
    <View style={[styles.badge, { backgroundColor: map[0] }]}>
      <Text variant="caption" weight="medium" style={{ color: map[1] }} numberOfLines={1}>
        {label.replace(/_/g, ' ')}
      </Text>
    </View>
  )
}

export function Chip({
  label,
  selected,
  onPress,
  icon: Icon,
}: {
  label: string
  selected?: boolean
  onPress?: () => void
  icon?: LucideIcon
}) {
  const { c } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? c.text : pressed ? c.surfaceAlt : 'transparent',
          borderColor: selected ? c.text : c.border,
        },
      ]}
    >
      {Icon ? <Icon size={14} color={selected ? c.bg : c.textMuted} strokeWidth={1.75} /> : null}
      <Text variant="small" weight="medium" style={{ color: selected ? c.bg : c.textMuted }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  const { c } = useTheme()
  return (
    <View style={[styles.segment, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, on && { backgroundColor: c.elevated, borderColor: c.border }]}
          >
            <Text variant="small" weight={on ? 'semibold' : 'medium'} tone={on ? 'default' : 'muted'} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function Loading({ label }: { label?: string }) {
  const { c } = useTheme()
  const t = useT()
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <ActivityIndicator color={c.accent} />
      <Text tone="muted" variant="small">
        {label ?? t('Loading…')}
      </Text>
    </View>
  )
}

export function EmptyState({ icon: Icon, title, body, action }: { icon?: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  const { c } = useTheme()
  return (
    <View style={[styles.center, { paddingVertical: space.xxxl }]}>
      {Icon ? <Icon size={28} color={c.textFaint} strokeWidth={1.5} /> : null}
      <Text variant="title" center>
        {title}
      </Text>
      {body ? (
        <Text tone="muted" center style={{ maxWidth: 320 }}>
          {body}
        </Text>
      ) : null}
      {action}
    </View>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { c } = useTheme()
  const t = useT()
  const message = error instanceof Error ? error.message : String(error)
  return (
    <View style={[styles.errorBox, { backgroundColor: c.dangerSoft, borderColor: c.danger }]} accessibilityRole="alert">
      <Text weight="semibold" tone="danger">
        {t('Something went wrong')}
      </Text>
      <Text variant="small" tone="default" selectable>
        {message}
      </Text>
      {onRetry ? (
        <Button label={t('Try again')} variant="secondary" size="sm" onPress={onRetry} style={{ alignSelf: 'flex-start' }} />
      ) : null}
    </View>
  )
}

export function Divider() {
  const { c } = useTheme()
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />
}

export function KeyValue({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <View style={styles.kv}>
      <Text variant="small" tone="muted" style={{ flexShrink: 0 }}>
        {label}
      </Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text variant="small" mono={mono} selectable style={{ flex: 1, textAlign: 'right' }} numberOfLines={3}>
          {String(value)}
        </Text>
      ) : (
        value
      )}
    </View>
  )
}

const ROW_GAP = 14
/** Where row text starts when the row has a 20px icon; dividers begin here. */
const ROW_TEXT_INSET = space.lg + 20 + ROW_GAP

/** react-native-web ignores thumbColor for the on state and uses its own teal. */
function webSwitchColors(thumb: string, track: string) {
  return Platform.OS === 'web' ? ({ activeThumbColor: thumb, activeTrackColor: track } as object) : {}
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xs, minHeight: 24 },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: HIT + 8,
  },
  rowRule: { position: 'absolute', right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
  badge: { borderRadius: radius.xs, paddingHorizontal: 6, paddingVertical: 1, alignSelf: 'flex-start' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    minHeight: 34,
  },
  segment: { flexDirection: 'row', borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: 3, gap: 3 },
  segmentItem: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    paddingHorizontal: space.sm,
  },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  errorBox: { borderRadius: radius.md, borderWidth: 1, padding: space.lg, gap: space.sm },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: space.lg, paddingVertical: space.xs },
})
