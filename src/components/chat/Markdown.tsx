import * as Clipboard from 'expo-clipboard'
import * as WebBrowser from 'expo-web-browser'
import { Check, Copy } from 'lucide-react-native'
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text as RNText, View, type TextStyle, type ViewStyle } from 'react-native'
import { Renderer, useMarkdown } from 'react-native-marked'

import { Text } from '@/components/ui'
import { t } from '@/i18n'
import { highlight } from '@/lib/highlight'
import { font, radius, space, useTheme, type Palette } from '@/theme'

/** Syntax colours tuned to the warm palette; muted so code reads as text first. */
const SYNTAX = {
  dark: {
    keyword: '#D7A6E0',
    string: '#A9C98A',
    number: '#E5A66B',
    literal: '#E5A66B',
    title: '#8DB4E8',
    type: '#E3C27A',
    built_in: '#E3C27A',
    attr: '#9CC7C0',
    attribute: '#9CC7C0',
    property: '#9CC7C0',
    variable: '#EDE9E2',
    meta: '#A7A096',
    addition: '#6CC88A',
    deletion: '#F07167',
    regexp: '#E49C81',
    symbol: '#E49C81',
    section: '#8DB4E8',
    name: '#D7A6E0',
    tag: '#D7A6E0',
  },
  light: {
    keyword: '#8A3FA0',
    string: '#3D7A2E',
    number: '#A9501C',
    literal: '#A9501C',
    title: '#215DA6',
    type: '#8A6200',
    built_in: '#8A6200',
    attr: '#1E7268',
    attribute: '#1E7268',
    property: '#1E7268',
    variable: '#1C1B18',
    meta: '#5E5A51',
    addition: '#1E7F3B',
    deletion: '#BF2E26',
    regexp: '#97462A',
    symbol: '#97462A',
    section: '#215DA6',
    name: '#8A3FA0',
    tag: '#8A3FA0',
  },
} as const

function tokenStyle(scope: string | undefined, isDark: boolean, c: Palette): TextStyle | undefined {
  if (!scope) return undefined
  if (scope === 'comment' || scope === 'quote') return { color: c.textFaint, fontStyle: 'italic' }
  const color = (SYNTAX[isDark ? 'dark' : 'light'] as Record<string, string>)[scope.split('.')[0].replace(/_$/, '')]
  return color ? { color } : undefined
}

const CodeBlock = memo(function CodeBlock({ code, language, c, isDark }: { code: string; language?: string; c: Palette; isDark: boolean }) {
  const [copied, setCopied] = useState(false)
  const body = code.replace(/\n$/, '')
  const tokens = useMemo(() => highlight(body, language), [body, language])
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
          {tokens
            ? tokens.map((tok, i) => (
                <RNText key={i} style={tokenStyle(tok.scope, isDark, c)}>
                  {tok.text}
                </RNText>
              ))
            : body}
        </RNText>
      </ScrollView>
    </View>
  )
})

class HermesRenderer extends Renderer {
  constructor(
    private readonly c: Palette,
    private readonly isDark: boolean,
  ) {
    super({ selectable: true })
  }

  code(text: string, language?: string, _container?: ViewStyle, _textStyle?: TextStyle): ReactNode {
    return <CodeBlock key={this.getKey()} code={text} language={language} c={this.c} isDark={this.isDark} />
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
  const renderer = useMemo(() => new HermesRenderer(c, isDark), [c, isDark])
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
      paragraph: { marginVertical: small ? 0 : 4 },
      strong: { fontFamily: font.bold, color },
      em: { fontStyle: 'italic', color },
      link: { color: c.accentText, textDecorationLine: 'underline' },
      h1: {
        fontFamily: font.bold,
        fontSize: 21 * scale,
        lineHeight: 28 * scale,
        color,
        marginTop: 8,
        borderBottomWidth: 0,
        paddingBottom: 0,
      },
      h2: {
        fontFamily: font.bold,
        fontSize: 18 * scale,
        lineHeight: 25 * scale,
        color,
        marginTop: 6,
        borderBottomWidth: 0,
        paddingBottom: 0,
      },
      h3: { fontFamily: font.semibold, fontSize: 17 * scale, lineHeight: 24 * scale, color, marginTop: 4 },
      h4: { fontFamily: font.semibold, fontSize: 15 * scale, color },
      codespan: { fontFamily: font.mono, fontStyle: 'normal', fontSize: (small ? 12 : 13.5) * scale, backgroundColor: c.surfaceAlt, color },
      blockquote: { borderLeftWidth: 2, borderLeftColor: c.borderStrong, paddingLeft: space.md },
      li: base,
      hr: { backgroundColor: c.border, height: 1, marginVertical: 8 },
      table: { borderColor: c.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, marginVertical: space.xs },
      tableRow: { borderColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth },
      tableCell: { paddingHorizontal: space.md, paddingVertical: 6, borderColor: c.border, borderRightWidth: StyleSheet.hairlineWidth },
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
