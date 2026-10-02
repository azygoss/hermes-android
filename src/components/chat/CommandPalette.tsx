import { useQuery } from '@tanstack/react-query'
import { memo, useMemo, useState } from 'react'
import { Pressable, SectionList, StyleSheet, View } from 'react-native'

import { Chip, ErrorState, Loading, Segmented, Sheet, Text, TextField } from '@/components/ui'
import { useT } from '@/i18n'
import type { CommandsCatalogResult } from '@/lib/gateway/contract.generated'
import { rpc, useProfile } from '@/lib/hermes'
import { space, useTheme } from '@/theme'

interface Props {
  visible: boolean
  onClose: () => void
  sessionId: string | null
  /** Put text in the composer for the user to finish (commands that take arguments, skills). */
  onInsert: (text: string) => void
  /** Run a command that needs nothing more. */
  onRun: (command: string) => void
}

interface Entry {
  name: string
  description: string
  usage?: string
  takesArgs: boolean
  sub: string[]
}

// Category names come from the backend; listed for the catalog extractor.
// t('Session') t('Configuration') t('Info') t('Tools & Skills')

/** Categories that only make sense in the terminal UI. */
const HIDDEN_CATEGORIES = new Set(['Exit', 'TUI'])
/** `desktop` placements that mean "terminal only" or "never surfaced". */
const HIDDEN_PLACEMENTS = new Set(['terminal', 'hidden'])

function split(description: string) {
  const m = description.match(/^(.*?)\s*\(usage: (.+)\)\s*$/)
  return m ? { description: m[1], usage: m[2] } : { description }
}

/** Browsable list of every slash command and skill the backend knows, so the powerful ones are findable. */
export function CommandPalette({ visible, onClose, sessionId, onInsert, onRun }: Props) {
  const t = useT()
  const profile = useProfile()
  const [tab, setTab] = useState<'commands' | 'skills'>('commands')
  const [q, setQ] = useState('')
  const catalog = useQuery({
    queryKey: ['commands.catalog', profile, sessionId],
    enabled: visible,
    staleTime: 5 * 60_000,
    queryFn: () => rpc().request('commands.catalog', { session_id: sessionId, profile }) as Promise<CommandsCatalogResult>,
  })

  const sections = useMemo(() => {
    const d = catalog.data
    if (!d) return []
    const needle = q.trim().toLowerCase().replace(/^\//, '')
    const matches = (e: Entry) => !needle || e.name.includes(needle) || e.description.toLowerCase().includes(needle)
    const skills = d.skills ?? {}
    const describe = new Map((d.pairs ?? []).map(([name, desc]) => [name, desc]))
    if (tab === 'skills') {
      const data = Object.entries(skills)
        .map(([name, meta]) => ({
          name,
          ...split(describe.get(name) ?? ''),
          takesArgs: true,
          sub: [],
          uses: meta.usage ?? 0,
        }))
        .filter(matches)
        .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name))
      return data.length ? [{ title: '', data }] : []
    }
    return (d.categories ?? [])
      .filter((c) => !HIDDEN_CATEGORIES.has(c.name))
      .map((c) => ({
        title: c.name,
        data: (c.pairs ?? [])
          .filter(([name]) => !skills[name] && !HIDDEN_PLACEMENTS.has(String(d.commands?.[name]?.desktop)))
          .map(([name, desc]) => ({
            name,
            ...split(desc),
            takesArgs: !!d.commands?.[name]?.argument_mode,
            sub: d.sub?.[name] ?? [],
          }))
          .filter(matches),
      }))
      .filter((s) => s.data.length)
  }, [catalog.data, q, tab])

  const insert = (text: string) => {
    onClose()
    onInsert(text)
  }
  const pick = (e: Entry) => {
    if (e.takesArgs || e.sub.length) return insert(`${e.name} `)
    onClose()
    onRun(e.name)
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t('Commands & skills')} noScroll heightRatio={0.92}>
      <View style={{ gap: space.sm, paddingBottom: space.sm }}>
        <TextField placeholder={t('Search commands')} value={q} onChangeText={setQ} autoCapitalize="none" />
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'commands', label: t('Commands') },
            {
              value: 'skills',
              label: t('Skills ({n})', { n: catalog.data?.skill_count ?? Object.keys(catalog.data?.skills ?? {}).length }),
            },
          ]}
        />
      </View>
      {catalog.isLoading ? <Loading /> : null}
      {catalog.error ? <ErrorState error={catalog.error} onRetry={() => catalog.refetch()} /> : null}
      <SectionList
        sections={sections}
        keyExtractor={(e) => e.name}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        style={{ marginHorizontal: -space.lg }}
        initialNumToRender={14}
        renderSectionHeader={({ section }) =>
          section.title ? (
            <Text variant="small" weight="semibold" tone="muted" style={styles.head} accessibilityRole="header">
              {t(section.title)}
            </Text>
          ) : null
        }
        renderItem={({ item }) => <CommandRow entry={item} onPick={pick} onSub={(s) => insert(`${item.name} ${s} `)} />}
        ListEmptyComponent={
          catalog.data ? (
            <Text tone="muted" style={styles.head}>
              {t('No commands match.')}
            </Text>
          ) : null
        }
      />
    </Sheet>
  )
}

const CommandRow = memo(function CommandRow({
  entry,
  onPick,
  onSub,
}: {
  entry: Entry
  onPick: (e: Entry) => void
  onSub: (sub: string) => void
}) {
  const { c } = useTheme()
  const t = useT()
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${entry.name}, ${entry.description}`}
        accessibilityHint={entry.takesArgs ? t('Adds it to the message box') : t('Runs it now')}
        onPress={() => onPick(entry)}
        android_ripple={{ color: c.surfaceAlt }}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surfaceAlt }]}
      >
        <View style={styles.nameLine}>
          <Text mono weight="medium" style={{ color: c.accentText }}>
            {entry.name}
          </Text>
          {!entry.takesArgs && !entry.sub.length ? (
            <Text variant="caption" tone="faint">
              {t('runs now')}
            </Text>
          ) : null}
        </View>
        {entry.description ? (
          <Text variant="small" tone="muted" numberOfLines={3}>
            {entry.description}
          </Text>
        ) : null}
        {entry.usage ? (
          <Text variant="caption" tone="faint" mono numberOfLines={2}>
            {entry.usage}
          </Text>
        ) : null}
      </Pressable>
      {entry.sub.length ? (
        <View style={styles.subs}>
          {entry.sub.map((s) => (
            <Chip key={s} label={s} onPress={() => onSub(s)} />
          ))}
        </View>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  head: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xs },
  row: { paddingHorizontal: space.lg, paddingVertical: space.sm + 2, gap: 2, minHeight: 48 },
  nameLine: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  subs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, paddingHorizontal: space.lg, paddingBottom: space.sm },
})
