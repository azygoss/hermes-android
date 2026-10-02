import { X } from 'lucide-react-native'
import { useEffect, useRef, type ReactNode } from 'react'
import { Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

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

/** Bottom sheet over a dimmed backdrop; the backdrop and the close button dismiss it. */
export function Sheet({ visible, onClose, title, children, noScroll, footer, heightRatio = 0.85 }: Props) {
  const { c } = useTheme()
  const t = useT()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const slide = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      slide.setValue(0)
      Animated.timing(slide, { toValue: 1, duration: motion.base, useNativeDriver: Platform.OS !== 'web' }).start()
    }
  }, [visible, slide])

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]}
          onPress={onClose}
          accessibilityLabel={t('Close')}
          accessibilityRole="button"
        />
        <View style={{ flex: 1 }} pointerEvents="box-none" />
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: c.surface,
              borderColor: c.border,
              maxHeight: height * heightRatio,
              paddingBottom: insets.bottom + space.md,
              transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
              opacity: slide,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: c.borderStrong }]} />
          {title ? (
            <View style={styles.head}>
              <Text variant="title" style={{ flex: 1 }} accessibilityRole="header" numberOfLines={2}>
                {title}
              </Text>
              <IconButton icon={X} label={t('Close')} onPress={onClose} />
            </View>
          ) : null}
          {noScroll ? (
            <View style={{ flexShrink: 1, paddingHorizontal: space.lg }}>{children}</View>
          ) : (
            <ScrollView
              style={{ flexShrink: 1 }}
              contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.md }}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          )}
          {footer ? <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm }}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, paddingTop: space.sm },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: space.xs },
  head: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.lg, paddingRight: space.xs, minHeight: 52 },
})
