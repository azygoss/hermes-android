import { Stack } from 'expo-router'
import { useState } from 'react'
import { ScrollView, View } from 'react-native'

import { Chip, ErrorState, Loading, Screen, Text, TextField, ToggleRow } from '@/components/ui'
import { useT } from '@/i18n'
import { useRest } from '@/lib/hooks'
import { radius, space, useTheme } from '@/theme'

const FILES = ['agent', 'errors', 'gateway', 'desktop']
const LEVELS = ['', 'DEBUG', 'INFO', 'WARNING', 'ERROR']

export default function LogsScreen() {
  const t = useT()
  const { c } = useTheme()
  const [file, setFile] = useState('agent')
  const [level, setLevel] = useState('')
  const [search, setSearch] = useState('')
  const [follow, setFollow] = useState(true)
  const q = useRest<{ file: string; lines: string[] }>(
    ['logs', file, level, search],
    '/api/logs',
    { file, lines: 300, level, search },
    { refetchInterval: follow ? 3000 : false },
  )

  const color = (line: string) =>
    / ERROR | CRITICAL |Traceback/.test(line) ? c.danger : / WARNING /.test(line) ? c.warn : / DEBUG /.test(line) ? c.textFaint : c.text

  return (
    <Screen>
      <Stack.Screen options={{ title: t('Logs') }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        {FILES.map((f) => (
          <Chip key={f} label={f} selected={file === f} onPress={() => setFile(f)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        {LEVELS.map((l) => (
          <Chip key={l || 'all'} label={l || t('all levels')} selected={level === l} onPress={() => setLevel(l)} />
        ))}
      </View>
      <TextField placeholder={t('Filter text')} value={search} onChangeText={setSearch} autoCapitalize="none" />
      <View style={{ marginHorizontal: -space.lg }}>
        <ToggleRow title={t('Follow (refresh every 3s)')} value={follow} onChange={setFollow} last />
      </View>
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
      <ScrollView horizontal style={{ backgroundColor: c.codeBg, borderRadius: radius.md }}>
        <View style={{ padding: space.sm }}>
          {(q.data?.lines ?? []).slice(-300).map((line, i) => (
            <Text key={i} mono variant="caption" style={{ color: color(line) }} selectable>
              {line.replace(/\n$/, '')}
            </Text>
          ))}
          {q.data && !q.data.lines.length ? <Text tone="muted">{t('No log lines.')}</Text> : null}
        </View>
      </ScrollView>
    </Screen>
  )
}
