import type { LucideIcon } from 'lucide-react-native'
import { ChevronRight } from 'lucide-react-native'
import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useT } from '@/i18n'
import { HIT, radius, space, useTheme } from '@/theme'

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
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[pad, { gap: space.lg }, style]}
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
    </ScrollView>
  )
}

export function Section({
  title,
  action,
  children,
  footer,
  style,
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  footer?: string
  style?: StyleProp<ViewStyle>
}) {
  const { c } = useTheme()
  return (
    <View style={[{ gap: space.sm }, style]}>
      {(title || action) && (
        <View style={styles.sectionHead}>
          {title ? (
            <Text
              variant="small"
              weight="semibold"
              tone="muted"
              accessibilityRole="header"
              style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}
            >
              {title}
            </Text>
          ) : (
            <View />
          )}
          {action}
        </View>
      )}
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>{children}</View>
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
  const content = (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
      {Icon ? (
        <View style={[styles.rowIcon, { backgroundColor: danger ? c.dangerSoft : c.surfaceAlt }]}>
          <Icon size={18} color={iconColor ?? (danger ? c.danger : c.accentText)} strokeWidth={2} />
        </View>
      ) : null}
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
      {right}
      {(chevron ?? (!!onPress && !right)) ? <ChevronRight size={18} color={c.textFaint} /> : null}
    </View>
  )
  if (!onPress && !onLongPress) return content
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      accessibilityState={{ disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: c.accentSoft }}
      style={({ pressed }) => ({ opacity: disabled ? 0.5 : pressed ? 0.8 : 1 })}
    >
      {content}
    </Pressable>
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
      android_ripple={{ color: c.accentSoft }}
    >
      <Row
        title={title}
        subtitle={subtitle}
        icon={icon}
        last={last}
        chevron={false}
        right={
          <Switch
            value={value}
            onValueChange={onChange}
            disabled={disabled}
            trackColor={{ false: c.borderStrong, true: c.accent }}
            thumbColor={value ? c.onAccent : c.textMuted}
            importantForAccessibility="no"
          />
        }
      />
    </Pressable>
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
      <Text variant="caption" weight="semibold" style={{ color: map[1] }} numberOfLines={1}>
        {label}
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
          backgroundColor: selected ? c.accentSoft : c.surfaceAlt,
          borderColor: selected ? c.accent : c.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      {Icon ? <Icon size={14} color={selected ? c.accentText : c.textMuted} /> : null}
      <Text variant="small" weight="medium" style={{ color: selected ? c.accentText : c.text }} numberOfLines={1}>
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
    <View style={[styles.segment, { backgroundColor: c.surfaceAlt, borderColor: c.border }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, on && { backgroundColor: c.elevated, borderColor: c.borderStrong }]}
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
      {Icon ? (
        <View style={[styles.emptyIcon, { backgroundColor: c.surfaceAlt }]}>
          <Icon size={26} color={c.textMuted} />
        </View>
      ) : null}
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

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xs, minHeight: 24 },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: HIT + 8,
  },
  rowIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  badge: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2, alignSelf: 'flex-start' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.md,
    minHeight: 36,
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
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  errorBox: { borderRadius: radius.md, borderWidth: 1, padding: space.lg, gap: space.sm },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: space.lg, paddingVertical: space.xs },
})
