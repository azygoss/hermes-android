import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { Animated, Modal, Platform, Pressable, StyleSheet, View } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { create } from 'zustand'

import { t as tr } from '@/i18n'
import { radius, space, useTheme } from '@/theme'

import { Button } from './Button'
import { Text } from './Text'
import { TextField } from './TextField'

interface DialogRequest {
  id: number
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  input?: { placeholder?: string; initial?: string; secret?: boolean; multiline?: boolean; label?: string }
  resolve: (value: string | boolean | null) => void
}

type ToastTone = 'info' | 'success' | 'error' | 'warn'
interface ToastItem {
  id: number
  text: string
  tone: ToastTone
  key?: string
}

interface UiState {
  dialogs: DialogRequest[]
  toasts: ToastItem[]
}

const useUi = create<UiState>(() => ({ dialogs: [], toasts: [] }))
let seq = 1

function push(d: Omit<DialogRequest, 'id' | 'resolve'>) {
  return new Promise<string | boolean | null>((resolve) => {
    useUi.setState((s) => ({ dialogs: [...s.dialogs, { ...d, id: seq++, resolve }] }))
  })
}

/** Yes/no question. Resolves true when confirmed. */
export async function confirm(title: string, message?: string, opts: { confirmLabel?: string; destructive?: boolean } = {}) {
  return (await push({ title, message, ...opts })) === true
}

/** Text prompt. Resolves the entered string, or null when cancelled. */
export async function prompt(
  title: string,
  opts: {
    message?: string
    placeholder?: string
    initial?: string
    secret?: boolean
    multiline?: boolean
    confirmLabel?: string
    label?: string
  } = {},
) {
  const { message, confirmLabel, ...input } = opts
  const v = await push({ title, message, confirmLabel, input })
  return typeof v === 'string' ? v : null
}

export function toast(text: string, tone: ToastTone = 'info', key?: string) {
  const id = seq++
  useUi.setState((s) => ({ toasts: [...s.toasts.filter((x) => !key || x.key !== key), { id, text, tone, key }].slice(-3) }))
  setTimeout(() => dismissToast(id), tone === 'error' ? 6000 : 3500)
}

export function dismissToast(idOrKey: number | string) {
  useUi.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== idOrKey && x.key !== idOrKey) }))
}

export function toastError(e: unknown) {
  toast(e instanceof Error ? e.message : String(e), 'error')
}

export function DialogHost() {
  const dialog = useUi((s) => s.dialogs[0])
  const { c } = useTheme()
  const [value, setValue] = useState('')

  useEffect(() => setValue(dialog?.input?.initial ?? ''), [dialog?.id, dialog?.input?.initial])

  if (!dialog) return null
  const close = (v: string | boolean | null) => {
    dialog.resolve(v)
    useUi.setState((s) => ({ dialogs: s.dialogs.slice(1) }))
  }
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => close(null)} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={[styles.backdrop, { backgroundColor: c.overlay }]}>
        <View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: c.elevated, borderColor: c.border }]}>
          <Text variant="title" accessibilityRole="header">
            {dialog.title}
          </Text>
          {dialog.message ? (
            <Text tone="muted" selectable>
              {dialog.message}
            </Text>
          ) : null}
          {dialog.input ? (
            <TextField
              autoFocus
              label={dialog.input.label}
              value={value}
              onChangeText={setValue}
              placeholder={dialog.input.placeholder}
              secret={dialog.input.secret}
              multiline={dialog.input.multiline}
              onSubmitEditing={dialog.input.multiline ? undefined : () => close(value)}
            />
          ) : null}
          <View style={styles.actions}>
            <Button label={dialog.cancelLabel ?? tr('Cancel')} variant="ghost" onPress={() => close(dialog.input ? null : false)} />
            <Button
              label={dialog.confirmLabel ?? tr('OK')}
              variant={dialog.destructive ? 'danger' : 'primary'}
              onPress={() => close(dialog.input ? value : true)}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

export function ToastHost() {
  const toasts = useUi((s) => s.toasts)
  const insets = useSafeAreaInsets()
  if (!toasts.length) return null
  return (
    <View pointerEvents="box-none" style={[styles.toastWrap, { bottom: insets.bottom + 88 }]}>
      {toasts.map((t) => (
        <ToastView key={t.id} item={t} />
      ))}
    </View>
  )
}

function ToastView({ item }: { item: ToastItem }) {
  const { c } = useTheme()
  const fade = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start()
  }, [fade])
  const Icon = { info: Info, success: CheckCircle2, error: XCircle, warn: AlertTriangle }[item.tone]
  const color = { info: c.info, success: c.success, error: c.danger, warn: c.warn }[item.tone]
  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
      <Pressable
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        onPress={() => dismissToast(item.id)}
        style={[styles.toast, { backgroundColor: c.elevated, borderColor: c.borderStrong }]}
      >
        <Icon size={18} color={color} />
        <Text variant="small" style={{ flex: 1 }} numberOfLines={4}>
          {item.text}
        </Text>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  dialog: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.xl,
    gap: space.md,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, marginTop: space.xs },
  toastWrap: { position: 'absolute', left: space.lg, right: space.lg, gap: space.sm },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 48,
  },
})
