import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio'
import * as DocumentPicker from 'expo-document-picker'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import {
  ArrowUp,
  Camera,
  CornerDownRight,
  FileText,
  Image as ImageIcon,
  Mic,
  Paperclip,
  Plus,
  Sparkles,
  Square,
  X,
  Zap,
} from '@/components/icons'
import { memo, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'

import { prompt, Row, Sheet, Text, toast, toastError } from '@/components/ui'
import { useT } from '@/i18n'
import type { CompletionItem } from '@/lib/gateway/contract.generated'
import { rpc } from '@/lib/hermes'
import { fileToBase64, transcribe } from '@/lib/voice'
import type { PendingAttachment } from '@/lib/chat/types'
import { useSettings } from '@/store/settings'
import { centered, font, radius, space, useTheme } from '@/theme'

interface Props {
  sessionId: string | null
  busy: boolean
  attachments: PendingAttachment[]
  editing: boolean
  prefill: string | null
  onPrefillConsumed: () => void
  onCancelEdit: () => void
  onSend: (text: string, mode: 'auto' | 'steer' | 'redirect') => Promise<boolean>
  onStop: () => void
  onAttachImage: (base64: string, name: string, uri: string) => Promise<void>
  onAttachFile: (dataUrl: string, name: string) => Promise<void>
  onAttachPdf: (base64: string, name: string) => Promise<void>
  onGenerateImage: (prompt: string) => Promise<void>
  onRemoveAttachment: (key: string) => void
  ensureSession: () => Promise<string>
  pills?: React.ReactNode
}

function useCompletions(text: string, sessionId: string | null) {
  const [items, setItems] = useState<CompletionItem[]>([])
  const [replaceFrom, setReplaceFrom] = useState(0)
  useEffect(() => {
    const slash = /^\/\S*(\s\S*)?$/.test(text) && text.length < 80
    const at = text.match(/(?:^|\s)(@\S*)$/)
    if (!slash && !at) {
      setItems([])
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        if (slash) {
          const res = await rpc().request('complete.slash', { text, session_id: sessionId }, { timeoutMs: 8000 })
          if (!cancelled) {
            setItems((res.items ?? []).slice(0, 30))
            setReplaceFrom(res.replace_from ?? 0)
          }
        } else if (at) {
          const word = at[1]
          const res = await rpc().request('complete.path', { word, session_id: sessionId }, { timeoutMs: 8000 })
          if (!cancelled) {
            setItems((res.items ?? []).slice(0, 30))
            setReplaceFrom(text.length - word.length)
          }
        }
      } catch {
        if (!cancelled) setItems([])
      }
    }, 140)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [text, sessionId])
  return { items, replaceFrom, clear: () => setItems([]) }
}

/** Unsent text per chat ('' = the blank new-chat composer), kept for the app session. */
const drafts = new Map<string, string>()

export const Composer = memo(function Composer(props: Props) {
  const { sessionId, busy, attachments, editing, prefill, onPrefillConsumed, onCancelEdit, onSend, onStop, pills } = props
  const t = useT()
  const { c } = useTheme()
  const haptics = useSettings((s) => s.haptics)
  const sendOnEnter = useSettings((s) => s.sendOnEnter)
  const [text, setText] = useState(() => drafts.get(sessionId ?? '') ?? '')
  const draftKey = useRef(sessionId ?? '')
  // Each chat keeps its own unsent text when you switch away and back.
  useEffect(() => {
    const next = sessionId ?? ''
    if (next === draftKey.current) return
    setText((cur) => {
      if (cur.trim()) drafts.set(draftKey.current, cur)
      else drafts.delete(draftKey.current)
      return drafts.get(next) ?? ''
    })
    draftKey.current = next
  }, [sessionId])
  const [sending, setSending] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const input = useRef<TextInput>(null)
  const { items, replaceFrom, clear } = useCompletions(text, sessionId)

  useEffect(() => {
    if (prefill != null) {
      setText(prefill)
      onPrefillConsumed()
      setTimeout(() => input.current?.focus(), 50)
    }
  }, [prefill, onPrefillConsumed])

  const uploading = attachments.some((a) => a.uploading)
  const canSend = (!!text.trim() || attachments.length > 0) && !uploading && !sending

  async function submit(mode: 'auto' | 'steer' | 'redirect' = 'auto') {
    if (!canSend) return
    const value = text
    setSending(true)
    setText('')
    clear()
    try {
      const ok = await onSend(value, mode)
      if (!ok) setText(value)
      else if (haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } catch (e) {
      setText(value)
      toastError(e)
    } finally {
      setSending(false)
    }
  }

  function accept(item: CompletionItem) {
    const head = text.slice(0, replaceFrom)
    const next = `${head}${item.text}`
    setText(/\/$/.test(item.text) ? next : `${next} `)
    clear()
    input.current?.focus()
  }

  async function toggleRecording() {
    try {
      if (recording) {
        setRecording(false)
        await recorder.stop()
        const uri = recorder.uri
        if (!uri) return
        setTranscribing(true)
        const words = await transcribe(uri, Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a')
        setText((cur) => (cur ? `${cur} ${words}` : words))
        if (!words) toast(t('No speech was recognised.'), 'warn')
        return
      }
      const perm = await requestRecordingPermissionsAsync()
      if (!perm.granted) {
        toast(t('Microphone permission is needed for voice messages.'), 'warn')
        return
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await recorder.prepareToRecordAsync()
      recorder.record()
      setRecording(true)
      if (haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    } catch (e) {
      setRecording(false)
      toastError(e)
    } finally {
      setTranscribing(false)
    }
  }

  async function pickImage(camera: boolean) {
    setAttachOpen(false)
    try {
      await props.ensureSession()
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        base64: true,
        quality: 0.85,
        allowsMultipleSelection: !camera,
        selectionLimit: 6,
      }
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync()
        if (!perm.granted) return toast(t('Camera permission is needed.'), 'warn')
      }
      const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts)
      if (res.canceled) return
      for (const asset of res.assets) {
        const b64 = asset.base64 ?? (await fileToBase64(asset.uri))
        await props.onAttachImage(b64, asset.fileName ?? `photo-${Date.now()}.jpg`, asset.uri)
      }
    } catch (e) {
      toastError(e)
    }
  }

  async function pickDocument(pdf: boolean) {
    setAttachOpen(false)
    try {
      await props.ensureSession()
      const res = await DocumentPicker.getDocumentAsync({
        type: pdf ? 'application/pdf' : '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      })
      if (res.canceled) return
      const asset = res.assets[0]
      if ((asset.size ?? 0) > 50 * 1024 * 1024) return toast(t('That file is larger than 50 MB.'), 'warn')
      const b64 = await fileToBase64(asset.uri)
      if (pdf) await props.onAttachPdf(b64, asset.name)
      else if ((asset.mimeType ?? '').startsWith('image/')) await props.onAttachImage(b64, asset.name, asset.uri)
      else await props.onAttachFile(`data:${asset.mimeType ?? 'application/octet-stream'};base64,${b64}`, asset.name)
    } catch (e) {
      toastError(e)
    }
  }

  const showStop = busy && !text.trim() && !attachments.length
  const SendIcon = showStop ? Square : ArrowUp

  return (
    <View style={[styles.wrap, centered, { backgroundColor: c.bg }]}>
      {items.length ? (
        <ScrollView style={[styles.suggest, { backgroundColor: c.elevated, borderColor: c.border }]} keyboardShouldPersistTaps="always">
          {items.map((item) => (
            <Pressable
              key={`${item.text}-${item.display}`}
              onPress={() => accept(item)}
              accessibilityRole="button"
              android_ripple={{ color: c.accentSoft }}
              style={styles.suggestRow}
            >
              <Text mono weight="medium" numberOfLines={1} style={{ flexShrink: 0, maxWidth: '55%' }}>
                {item.display || item.text}
              </Text>
              {item.meta ? (
                <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
                  {item.meta}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {editing ? (
        <View style={[styles.editBar, { backgroundColor: c.accentSoft }]}>
          <CornerDownRight size={14} color={c.accentText} />
          <Text variant="small" tone="accent" style={{ flex: 1 }}>
            {t('Editing — sending rewinds the chat to this message')}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Cancel edit')} hitSlop={12} onPress={onCancelEdit}>
            <X size={16} color={c.accentText} />
          </Pressable>
        </View>
      ) : null}

      {attachments.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingBottom: space.sm }}>
          {attachments.map((a) => (
            <View key={a.key} style={[styles.attachment, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              {a.uploading ? (
                <ActivityIndicator size="small" color={c.accent} />
              ) : a.kind === 'file' ? (
                <FileText size={14} color={c.textMuted} />
              ) : (
                <ImageIcon size={14} color={c.textMuted} />
              )}
              <Text variant="caption" numberOfLines={1} style={{ maxWidth: 140 }}>
                {a.name}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Remove {name}', { name: a.name })}
                hitSlop={10}
                onPress={() => props.onRemoveAttachment(a.key)}
              >
                <X size={14} color={c.textMuted} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <View style={[styles.box, { backgroundColor: c.surface, borderColor: recording ? c.danger : c.border }]}>
        <TextInput
          ref={input}
          value={text}
          onChangeText={setText}
          placeholder={
            recording ? t('Listening… tap the mic to stop') : busy ? t('Queue a message, or long-press send to steer') : t('Message Hermes')
          }
          placeholderTextColor={c.textFaint}
          multiline
          accessibilityLabel={t('Message')}
          style={[styles.input, { color: c.text, fontFamily: font.regular }]}
          selectionColor={c.accent}
          cursorColor={c.accent}
          submitBehavior={sendOnEnter ? 'submit' : 'newline'}
          onSubmitEditing={sendOnEnter ? () => submit() : undefined}
          returnKeyType={sendOnEnter ? 'send' : 'default'}
        />
        <View style={styles.toolbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Attach')}
            onPress={() => setAttachOpen(true)}
            style={({ pressed }) => [styles.side, pressed && { backgroundColor: c.surfaceAlt }]}
          >
            <Plus size={20} color={c.textMuted} strokeWidth={1.75} />
          </Pressable>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={styles.pills}
            keyboardShouldPersistTaps="handled"
          >
            {pills}
          </ScrollView>
          {!text.trim() && !attachments.length && !busy ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={recording ? t('Stop recording') : t('Record a voice message')}
              onPress={toggleRecording}
              style={({ pressed }) => [styles.side, (recording || pressed) && { backgroundColor: recording ? c.dangerSoft : c.surfaceAlt }]}
            >
              {transcribing ? (
                <ActivityIndicator size="small" color={c.textMuted} />
              ) : (
                <Mic size={20} color={recording ? c.danger : c.textMuted} strokeWidth={1.75} />
              )}
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showStop ? t('Stop the agent') : t('Send')}
            accessibilityHint={busy && !showStop ? t('Long-press for steer and interrupt options') : undefined}
            onPress={() => (showStop ? onStop() : submit())}
            onLongPress={() => (busy && canSend ? setModeOpen(true) : undefined)}
            disabled={!showStop && !canSend}
            style={[styles.send, { backgroundColor: showStop ? c.text : canSend ? c.accent : c.surfaceAlt }]}
          >
            {sending ? (
              <ActivityIndicator size="small" color={c.onAccent} />
            ) : (
              <SendIcon
                size={showStop ? 12 : 18}
                color={showStop ? c.bg : canSend ? c.onAccent : c.textFaint}
                fill={showStop ? c.bg : 'none'}
                strokeWidth={2.25}
              />
            )}
          </Pressable>
        </View>
      </View>

      <Sheet visible={attachOpen} onClose={() => setAttachOpen(false)} title={t('Attach')}>
        <View style={{ marginHorizontal: -space.lg }}>
          <Row
            icon={ImageIcon}
            title={t('Photo library')}
            subtitle={t('Send images for the agent to look at')}
            onPress={() => pickImage(false)}
          />
          <Row icon={Camera} title={t('Take a photo')} onPress={() => pickImage(true)} />
          <Row icon={FileText} title={t('PDF')} subtitle={t('Pages are sent as images')} onPress={() => pickDocument(true)} />
          <Row
            icon={Sparkles}
            title={t('Generate an image')}
            subtitle={t('Uses the image tool configured on the backend')}
            onPress={async () => {
              setAttachOpen(false)
              const p = await prompt(t('Describe the image'), { multiline: true, placeholder: t('A lighthouse at dusk, watercolor') })
              if (p) await props.onGenerateImage(p).catch(toastError)
            }}
          />
          <Row
            icon={Paperclip}
            title={t('Any file')}
            subtitle={t('Uploaded to the session workspace as an @file reference')}
            onPress={() => pickDocument(false)}
            last
          />
        </View>
      </Sheet>

      <Sheet visible={modeOpen} onClose={() => setModeOpen(false)} title={t('The agent is working')}>
        <View style={{ marginHorizontal: -space.lg }}>
          <Row
            icon={ArrowUp}
            title={t('Send normally')}
            subtitle={t('Follows the backend busy mode (queue by default)')}
            onPress={() => (setModeOpen(false), submit('auto'))}
          />
          <Row
            icon={Zap}
            title={t('Steer')}
            subtitle={t('Inject a note after the next tool call without stopping')}
            onPress={() => (setModeOpen(false), submit('steer'))}
          />
          <Row
            icon={Square}
            title={t('Interrupt and redirect')}
            subtitle={t('Stop the current turn and follow this instead')}
            onPress={() => (setModeOpen(false), submit('redirect'))}
            last
          />
        </View>
      </Sheet>
    </View>
  )
})

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.md, paddingTop: space.xs },
  box: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.xl, paddingTop: 4, paddingBottom: 6, paddingHorizontal: 6 },
  input: { fontSize: 16, lineHeight: 22, maxHeight: 160, minHeight: 44, paddingTop: 10, paddingBottom: 6, paddingHorizontal: 10 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  side: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  suggest: { maxHeight: 240, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, marginBottom: space.sm },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, minHeight: 44 },
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    height: 34,
  },
  editBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    marginBottom: space.sm,
  },
  pills: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingRight: space.xs },
})
