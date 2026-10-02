import { Stack } from 'expo-router'
import { Play, Trash2 } from 'lucide-react-native'
import { useState } from 'react'
import { ScrollView, View } from 'react-native'

import { Badge, Button, Chip, Screen, Text, TextField, toastError } from '@/components/ui'
import { useT } from '@/i18n'
import { rpc, useProfile } from '@/lib/hermes'
import { radius, space, useTheme } from '@/theme'

const PRESETS = [
  'version',
  'status',
  'doctor',
  'config',
  'skills list',
  'cron list',
  'gateway status',
  'profile list',
  'tools list',
  'sessions list',
  'insights --days 7',
]

/** Split a command line on spaces, honouring simple quotes. */
function argv(line: string) {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  for (const m of line.matchAll(re)) out.push(m[1] ?? m[2] ?? m[3])
  return out
}

interface Run {
  cmd: string
  code: number
  output: string
  blocked: boolean
  hint?: string | null
}

/** Run non-interactive `hermes …` subcommands on the backend. */
export default function CliScreen() {
  const t = useT()
  const { c } = useTheme()
  const profile = useProfile()
  const [line, setLine] = useState('')
  const [busy, setBusy] = useState(false)
  const [runs, setRuns] = useState<Run[]>([])

  async function run(cmd = line) {
    const args = argv(cmd.replace(/^hermes\s+/, ''))
    if (!args.length) return
    setBusy(true)
    try {
      const res = await rpc().request('cli.exec', { argv: args, timeout: 120, profile }, { timeoutMs: 150_000 })
      setRuns((cur) =>
        [{ cmd: args.join(' '), code: res.code, output: res.output, blocked: res.blocked, hint: res.hint }, ...cur].slice(0, 20),
      )
      setLine('')
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('Hermes CLI') }} />
      <Text tone="muted" variant="small">
        {t('Runs `hermes <command>` on the backend without a terminal. Interactive commands are refused.')}
      </Text>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <TextField
            value={line}
            onChangeText={setLine}
            placeholder="skills list"
            mono
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={() => run()}
            returnKeyType="go"
          />
        </View>
        <Button icon={Play} label={t('Run')} onPress={() => run()} loading={busy} disabled={!line.trim()} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        {PRESETS.map((p) => (
          <Chip key={p} label={p} onPress={() => run(p)} />
        ))}
      </View>
      {runs.length ? (
        <Button
          variant="ghost"
          size="sm"
          icon={Trash2}
          label={t('Clear')}
          onPress={() => setRuns([])}
          style={{ alignSelf: 'flex-start' }}
        />
      ) : null}
      {runs.map((r, i) => (
        <View key={i} style={{ gap: space.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text mono weight="medium" style={{ flex: 1 }} numberOfLines={1}>
              $ hermes {r.cmd}
            </Text>
            <Badge
              label={r.blocked ? t('refused') : t('exit {code}', { code: r.code })}
              tone={r.blocked || r.code ? 'danger' : 'success'}
            />
          </View>
          {r.hint ? (
            <Text variant="small" tone="warn">
              {r.hint}
            </Text>
          ) : null}
          <ScrollView horizontal style={{ backgroundColor: c.codeBg, borderRadius: radius.md }}>
            <Text mono variant="caption" selectable style={{ padding: space.sm }}>
              {r.output.replace(/\x1b\[[0-9;]*m/g, '') || ' '}
            </Text>
          </ScrollView>
        </View>
      ))}
    </Screen>
  )
}
