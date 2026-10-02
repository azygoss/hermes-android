import * as Clipboard from 'expo-clipboard'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, Modal, ScrollView, StyleSheet, Text as RNText, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ChevronDown, ChevronUp, Copy, X } from '@/components/icons'
import { IconButton, Text, toast } from '@/components/ui'
import { useT } from '@/i18n'
import { font, radius, space, useTheme } from '@/theme'

const LINE_HEIGHT = 19

/** Full-screen, searchable view of a long tool output or input. Lines are virtualised and never wrap. */
export function TextViewer({ visible, onClose, title, text }: { visible: boolean; onClose: () => void; title: string; text: string }) {
  const t = useT()
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const [q, setQ] = useState('')
  const [hit, setHit] = useState(0)
  const list = useRef<FlatList<string>>(null)
  const lines = useMemo(() => text.split('\n'), [text])
  const needle = q.trim().toLowerCase()
  const hits = useMemo(
    () => (needle ? lines.reduce<number[]>((acc, l, i) => (l.toLowerCase().includes(needle) ? (acc.push(i), acc) : acc), []) : []),
    [lines, needle],
  )

  useEffect(() => setHit(0), [needle])
  useEffect(() => {
    if (hits.length) list.current?.scrollToIndex({ index: hits[hit], viewPosition: 0.3, animated: true })
  }, [hits, hit])

  const step = (d: number) => hits.length && setHit((h) => (h + d + hits.length) % hits.length)
  const gutter = String(lines.length).length

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={[styles.head, { borderBottomColor: c.border }]}>
          <IconButton icon={X} label={t('Close')} onPress={onClose} />
          <View style={{ flex: 1 }}>
            <Text weight="semibold" numberOfLines={1}>
              {title}
            </Text>
            <Text variant="caption" tone="faint">
              {t('{n} lines', { n: lines.length })}
            </Text>
          </View>
          <IconButton
            icon={Copy}
            label={t('Copy')}
            onPress={async () => {
              await Clipboard.setStringAsync(text)
              toast(t('Copied'), 'success')
            }}
          />
        </View>
        <View style={[styles.search, { borderBottomColor: c.border }]}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={t('Find in output')}
            placeholderTextColor={c.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => step(1)}
            accessibilityLabel={t('Find in output')}
            style={[styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.border, fontFamily: font.regular }]}
          />
          <Text variant="small" tone="muted" style={{ minWidth: 52, textAlign: 'center' }}>
            {needle ? (hits.length ? `${hit + 1}/${hits.length}` : '0') : ''}
          </Text>
          <IconButton icon={ChevronUp} label={t('Previous match')} onPress={() => step(-1)} disabled={!hits.length} />
          <IconButton icon={ChevronDown} label={t('Next match')} onPress={() => step(1)} disabled={!hits.length} />
        </View>
        <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
          <FlatList
            ref={list}
            data={lines}
            keyExtractor={(_, i) => String(i)}
            getItemLayout={(_, i) => ({ length: LINE_HEIGHT, offset: LINE_HEIGHT * i + space.sm, index: i })}
            initialNumToRender={60}
            windowSize={15}
            contentContainerStyle={{ paddingVertical: space.sm }}
            renderItem={({ item, index }) => (
              <Line text={item} number={index + 1} gutter={gutter} needle={needle} current={hits.length > 0 && hits[hit] === index} />
            )}
          />
        </ScrollView>
      </View>
    </Modal>
  )
}

function Line({
  text,
  number,
  gutter,
  needle,
  current,
}: {
  text: string
  number: number
  gutter: number
  needle: string
  current: boolean
}) {
  const { c } = useTheme()
  const base = { fontFamily: font.mono, fontSize: 12.5, lineHeight: LINE_HEIGHT, color: c.text }
  let body: React.ReactNode = text || ' '
  if (needle && text.toLowerCase().includes(needle)) {
    const parts: React.ReactNode[] = []
    const lower = text.toLowerCase()
    let from = 0
    let at = lower.indexOf(needle)
    while (at >= 0) {
      if (at > from) parts.push(text.slice(from, at))
      parts.push(
        <RNText key={at} style={{ backgroundColor: current ? c.accent : c.accentSoft, color: current ? c.onAccent : c.text }}>
          {text.slice(at, at + needle.length)}
        </RNText>,
      )
      from = at + needle.length
      at = lower.indexOf(needle, from)
    }
    if (from < text.length) parts.push(text.slice(from))
    body = parts
  }
  return (
    <View style={{ flexDirection: 'row', height: LINE_HEIGHT, paddingRight: space.lg }}>
      <RNText style={[base, { color: c.textFaint, width: gutter * 8 + space.lg, textAlign: 'right', paddingRight: space.sm }]}>
        {number}
      </RNText>
      <RNText style={base} selectable numberOfLines={1}>
        {body}
      </RNText>
    </View>
  )
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingRight: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: space.md,
    paddingRight: space.xs,
    paddingVertical: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 40,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    fontSize: 15,
  },
})
