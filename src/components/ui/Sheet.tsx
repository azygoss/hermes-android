import { X } from '@/components/icons'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { useT } from '@/i18n'
import { motion, radius, space, useTheme } from '@/theme'

import { IconButton } from './Button'
import { Text } from './Text'

interface Props {
  visible: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** Render children directly instead of inside a ScrollView (for FlatLists). */
  noScroll?: boolean
  footer?: ReactNode
  heightRatio?: number
}

const SPRING = { damping: 26, stiffness: 300, mass: 0.9 } as const
/** Dragged this far, or flicked this fast, the sheet closes; otherwise it springs back. */
const DISMISS_DISTANCE = 90
const DISMISS_VELOCITY = 900

/**
 * Bottom sheet over a dimmed backdrop. It springs up, follows the finger when dragged by its handle
 * or title, and slides away on close; the backdrop and the close button dismiss it too.
 */
export function Sheet({ visible, onClose, title, children, noScroll, footer, heightRatio = 0.85 }: Props) {
  const { c } = useTheme()
  const t = useT()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  // Stays mounted through the exit animation, showing what it had when it was closed.
  const [mounted, setMounted] = useState(visible)
  const [kept, setKept] = useState({ title, children, footer })
  if (visible && (kept.title !== title || kept.children !== children || kept.footer !== footer)) setKept({ title, children, footer })
  const shown = visible ? { title, children, footer } : kept
  if (visible && !mounted) setMounted(true)
  const progress = useSharedValue(0)
  const drag = useSharedValue(0)
  const sheetHeight = useSharedValue(height)

  useEffect(() => {
    if (visible) {
      drag.set(0)
      progress.set(withSpring(1, SPRING))
    } else {
      progress.set(
        withTiming(0, { duration: motion.fast }, (finished) => {
          if (finished) scheduleOnRN(setMounted, false)
        }),
      )
    }
  }, [visible, progress, drag])

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(8)
        .failOffsetY(-8)
        .onUpdate((e) => {
          drag.set(Math.max(0, e.translationY))
        })
        .onEnd((e) => {
          if (drag.value > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) scheduleOnRN(onClose)
          else drag.set(withSpring(0, SPRING))
        }),
    [drag, onClose],
  )

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * interpolate(drag.value, [0, sheetHeight.value], [1, 0.3], Extrapolation.CLAMP),
  }))
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * sheetHeight.value + drag.value }],
  }))

  if (!mounted) return null
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }, backdropStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('Close')} accessibilityRole="button" />
          </Animated.View>
          <View style={{ flex: 1 }} pointerEvents="box-none" />
          <Animated.View
            accessibilityViewIsModal
            onLayout={(e) => {
              sheetHeight.set(e.nativeEvent.layout.height)
            }}
            style={[
              styles.sheet,
              { backgroundColor: c.surface, borderColor: c.border, maxHeight: height * heightRatio, paddingBottom: insets.bottom + space.md },
              sheetStyle,
            ]}
          >
            <GestureDetector gesture={pan}>
              <View>
                <View style={styles.grabArea}>
                  <View style={[styles.grabber, { backgroundColor: c.borderStrong }]} />
                </View>
                {shown.title ? (
                  <View style={styles.head}>
                    <Text variant="title" style={{ flex: 1 }} accessibilityRole="header" numberOfLines={2}>
                      {shown.title}
                    </Text>
                    <IconButton icon={X} label={t('Close')} onPress={onClose} />
                  </View>
                ) : null}
              </View>
            </GestureDetector>
            {noScroll ? (
              <View style={{ flexShrink: 1, paddingHorizontal: space.lg }}>{shown.children}</View>
            ) : (
              <ScrollView
                style={{ flexShrink: 1 }}
                contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.md }}
                keyboardShouldPersistTaps="handled"
              >
                {shown.children}
              </ScrollView>
            )}
            {shown.footer ? (
              <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm }}>{shown.footer}</View>
            ) : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0 },
  grabArea: { alignItems: 'center', paddingTop: space.sm, paddingBottom: space.xs },
  grabber: { width: 36, height: 4, borderRadius: 2 },
  head: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.lg, paddingRight: space.xs, minHeight: 52 },
})
