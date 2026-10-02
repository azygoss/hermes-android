import * as Clipboard from 'expo-clipboard'
import * as WebBrowser from 'expo-web-browser'
import { Check, Copy } from 'lucide-react-native'
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text as RNText, View, type TextStyle, type ViewStyle } from 'react-native'
import { Renderer, useMarkdown } from 'react-native-marked'

import { Text } from '@/components/ui'
import { t } from '@/i18n'
import { font, radius, space, useTheme, type Palette } from '@/theme'

function CodeBlock({ code, language, c }: { code: string; language?: string; c: Palette }) {
  const [copied, setCopied] = useState(false)
  return (
    <View style={[styles.code, { backgroundColor: c.codeBg, borderColor: c.border }]}>
      <View style={[styles.codeHead, { borderBottomColor: c.border }]}>
        <Text variant="caption" tone="faint" mono>
          {language || 'text'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Copy code')}
          hitSlop={12}
          onPress={async () => {
            await Clipboard.setStringAsync(code)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          style={styles.copy}
        >
          {copied ? <Check size={14} color={c.success} /> : <Copy size={14} color={c.textMuted} />}
          <Text variant="caption" tone="muted">
            {copied ? t('Copied') : t('Copy')}
          </Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: space.md }}>
        <RNText selectable style={{ fontFamily: font.mono, fontSize: 13, lineHeight: 19, color: c.text }}>
          {code.replace(/\n$/, '')}
        </RNText>
      </ScrollView>
    </View>
  )
}

class HermesRenderer extends Renderer {
  constructor(private readonly c: Palette) {
    super({ selectable: true })
  }

  code(text: string, language?: string, _container?: ViewStyle, _textStyle?: TextStyle): ReactNode {
    return <CodeBlock key={this.getKey()} code={text} language={language} c={this.c} />
  }

  link(children: string | ReactNode[], href: string, styles?: TextStyle): ReactNode {
    return (
      <RNText
        key={this.getKey()}
        accessibilityRole="link"
        style={styles}
        onPress={() => {
          if (/^https?:\/\//i.test(href)) void WebBrowser.openBrowserAsync(href)
        }}
      >
        {children}
      </RNText>
    )
  }
}

/**
 * Latest value, but at most once per `ms` while it keeps changing. Streaming replies arrive in
 * many small deltas; re-parsing the whole markdown tree for each one is the chat's main cost.
 */
function useThrottled(value: string, ms: number) {
  const [shown, setShown] = useState(value)
  const last = useRef(0)
  useEffect(() => {
    if (!ms) return
    const id = setTimeout(
      () => {
        last.current = Date.now()
        setShown(value)
      },
      Math.max(0, last.current + ms - Date.now()),
    )
    return () => clearTimeout(id)
  }, [value, ms])
  return ms ? shown : value
}

export const Markdown = memo(function Markdown({
  text: source,
  muted,
  small,
  live,
}: {
  text: string
  muted?: boolean
  small?: boolean
  /** Still streaming: parse at a throttled rate. */
  live?: boolean
}) {
  const { c, isDark, fontScale: scale } = useTheme()
  const text = useThrottled(source, live ? 90 : 0)
  const renderer = useMemo(() => new HermesRenderer(c), [c])
  const color = muted ? c.textMuted : c.text
  const base: TextStyle = small
    ? { fontFamily: font.regular, fontSize: 13 * scale, lineHeight: 19 * scale, color }
    : { fontFamily: font.regular, fontSize: 15 * scale, lineHeight: 23 * scale, color }
  const elements = useMarkdown(text, {
    colorScheme: isDark ? 'dark' : 'light',
    renderer,
    theme: {
      colors: { text: color, link: c.accentText, border: c.border, code: c.codeBg },
      spacing: { xs: 2, s: 4, m: 8, l: 12 },
    },
    styles: {
      text: base,
      paragraph: { marginVertical: 4 },
      strong: { fontFamily: font.bold, color },
      em: { fontStyle: 'italic', color },
      link: { color: c.accentText, textDecorationLine: 'underline' },
      h1: { fontFamily: font.bold, fontSize: 22 * scale, lineHeight: 30 * scale, color, marginTop: 8 },
      h2: { fontFamily: font.bold, fontSize: 19 * scale, lineHeight: 26 * scale, color, marginTop: 6 },
      h3: { fontFamily: font.semibold, fontSize: 17 * scale, lineHeight: 24 * scale, color, marginTop: 4 },
      h4: { fontFamily: font.semibold, fontSize: 15 * scale, color },
      codespan: { fontFamily: font.mono, fontSize: (small ? 12 : 13.5) * scale, backgroundColor: c.surfaceAlt, color },
      blockquote: { borderLeftWidth: 2, borderLeftColor: c.borderStrong, paddingLeft: space.md },
      li: base,
      hr: { backgroundColor: c.border, height: 1, marginVertical: 8 },
      table: { borderColor: c.border, borderWidth: 1, borderRadius: radius.sm },
      tableRow: { borderColor: c.border },
      tableCell: { padding: 6, borderColor: c.border },
    },
  })
  return <View style={{ gap: 2 }}>{elements}</View>
})

const styles = StyleSheet.create({
  code: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, marginVertical: space.xs, overflow: 'hidden' },
  codeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28, paddingHorizontal: 4 },
})
