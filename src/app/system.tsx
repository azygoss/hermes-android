import { File, Paths } from 'expo-file-system'
import { Stack } from 'expo-router'
import * as Sharing from 'expo-sharing'
import {
  Archive,
  ArrowUpCircle,
  Bug,
  Eraser,
  FileStack,
  Gauge,
  HardDrive,
  ListX,
  Ruler,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Trash2,
  Webhook,
} from 'lucide-react-native'
import { useState } from 'react'
import { Platform, View } from 'react-native'

import { ActionRunner, type RunningAction } from '@/components/ActionRunner'
import {
  Badge,
  Button,
  Card,
  Chip,
  confirm,
  KeyValue,
  Loading,
  prompt,
  Row,
  Screen,
  Section,
  Sheet,
  Text,
  TextField,
  toast,
  toastError,
  ToggleRow,
} from '@/components/ui'
import { useT } from '@/i18n'
import { bytes, dateTime } from '@/lib/format'
import { useRest } from '@/lib/hooks'
import { hermes, rest } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { space, useTheme } from '@/theme'

interface Stats {
  os: string
  hostname: string
  python_version: string
  hermes_version: string
  cpu_count: number
  cpu_percent: number
  memory: { total: number; used: number; percent: number }
  disk: { total: number; used: number; percent: number }
  load_avg?: number[]
  uptime_seconds?: number
}

export default function SystemScreen() {
  const t = useT()
  const { c } = useTheme()
  const stats = useRest<Stats>(['system', 'stats'], '/api/system/stats', undefined, { refetchInterval: 10_000 })
  const update = useRest<{
    current_version: string
    behind: number
    update_available: boolean
    can_apply: boolean
    update_command: string
    message: string
  }>(['system', 'update'], '/api/hermes/update/check')
  const curator = useRest<{ enabled: boolean; paused: boolean; interval_hours: number | null; last_run_at: string | null }>(
    ['system', 'curator'],
    '/api/curator',
  )
  const checkpoints = useRest<{ sessions: unknown[]; total_bytes: number }>(['system', 'checkpoints'], '/api/ops/checkpoints')
  const sessionStats = useRest<{ total: number; messages: number; archived: number; by_source: Record<string, number> }>(
    ['system', 'sessions'],
    '/api/sessions/stats',
  )
  const [action, setAction] = useState<RunningAction | null>(null)
  const [hooksOpen, setHooksOpen] = useState(false)
  const [lastBackup, setLastBackup] = useState<string | null>(null)

  const start = (title: string, path: string, body?: unknown) => async () => {
    try {
      const res = await rest().post<{ ok?: boolean; name: string; error?: string; message?: string }>(path, body ?? {}, {
        noProfile: false,
        timeoutMs: 120_000,
      })
      if (res.ok === false) throw new Error(res.error || res.message)
      setAction({ title, name: res.name })
    } catch (e) {
      toastError(e)
    }
  }

  async function downloadBackup(archive: string) {
    try {
      if (Platform.OS === 'web') {
        toast(t('Download is available in the Android app.'), 'info')
        return
      }
      const url = hermes().rest.url('/api/ops/backup/download', { archive })
      const dest = new File(Paths.cache, archive.split('/').pop() || 'hermes-backup.zip')
      if (dest.exists) dest.delete()
      const file = await File.downloadFileAsync(url, dest, { headers: await hermes().authHeaders() })
      await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', dialogTitle: t('Save backup') })
    } catch (e) {
      toastError(e)
    }
  }

  const s = stats.data
  return (
    <Screen refreshing={stats.isRefetching} onRefresh={() => queryClient.invalidateQueries({ queryKey: ['system'] })}>
      <Stack.Screen options={{ title: t('System') }} />
      {s ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Gauge size={18} color={c.accentText} />
            <Text weight="semibold" style={{ flex: 1 }}>
              {s.hostname}
            </Text>
            <Badge label={s.os} />
          </View>
          <KeyValue
            label={t('CPU')}
            value={`${s.cpu_percent}% · ${s.cpu_count} cores${s.load_avg ? ` · load ${s.load_avg.map((x) => x.toFixed(2)).join(' ')}` : ''}`}
          />
          <KeyValue label={t('Memory')} value={`${bytes(s.memory.used)} / ${bytes(s.memory.total)} (${s.memory.percent}%)`} />
          <KeyValue label={t('Disk')} value={`${bytes(s.disk.used)} / ${bytes(s.disk.total)} (${s.disk.percent}%)`} />
          <KeyValue label="Python" value={s.python_version} />
          {s.uptime_seconds ? <KeyValue label={t('Uptime')} value={`${Math.round(s.uptime_seconds / 86400)}d`} /> : null}
        </Card>
      ) : (
        <Loading />
      )}

      <Section title={t('Updates')}>
        <Row
          icon={ArrowUpCircle}
          title={update.data?.current_version ?? '…'}
          subtitle={update.data?.message}
          right={
            update.data?.update_available ? (
              <Badge label={t('{n} behind', { n: update.data.behind })} tone="info" />
            ) : (
              <Badge label={t('up to date')} tone="success" />
            )
          }
          last={!update.data?.update_available}
        />
        {update.data?.update_available && update.data.can_apply ? (
          <Row
            icon={ArrowUpCircle}
            title={t('Update Hermes now')}
            subtitle={update.data.update_command}
            onPress={async () => {
              if (
                await confirm(t('Update Hermes?'), t('The backend restarts when the update finishes; the app reconnects on its own.'), {
                  confirmLabel: t('Update'),
                })
              )
                await start(t('Updating Hermes'), '/api/hermes/update')()
            }}
            last
          />
        ) : null}
      </Section>

      <Section title={t('Health')}>
        <Row
          icon={Stethoscope}
          title={t('Run doctor')}
          subtitle={t('Check the install, providers and dependencies')}
          onPress={start(t('Doctor'), '/api/ops/doctor')}
        />
        <Row
          icon={ShieldCheck}
          title={t('Security audit')}
          subtitle={t('Look for exposed secrets and risky settings')}
          onPress={start(t('Security audit'), '/api/ops/security-audit')}
        />
        <Row
          icon={Ruler}
          title={t('Prompt size report')}
          subtitle={t('What fills the system prompt')}
          onPress={start(t('Prompt size'), '/api/ops/prompt-size')}
        />
        <Row
          icon={FileStack}
          title={t('Migrate config')}
          subtitle={t('Upgrade config.yaml to the latest version')}
          onPress={start(t('Config migration'), '/api/ops/config-migrate')}
        />
        <Row icon={ScanSearch} title={t('Diagnostics dump')} onPress={start(t('Dump'), '/api/ops/dump')} />
        <Row
          icon={Bug}
          title={t('Share a debug report')}
          subtitle={t('Uploads a redacted bundle and gives you a link')}
          onPress={async () => {
            if (!(await confirm(t('Upload a debug report?'), t('Secrets are redacted before upload.')))) return
            try {
              const res = await rest().post<{ url?: string; message?: string }>(
                '/api/ops/debug-share',
                { redact: true, lines: 300 },
                { timeoutMs: 120_000 },
              )
              await prompt(t('Debug report'), { initial: res.url ?? res.message ?? '', message: t('Copy the link to share it.') })
            } catch (e) {
              toastError(e)
            }
          }}
          last
        />
      </Section>

      <Section title={t('Backup')}>
        <Row
          icon={Archive}
          title={t('Create a backup')}
          subtitle={t('Config, keys, memory, skills and sessions as one zip')}
          onPress={start(t('Backup'), '/api/ops/backup', {})}
        />
        {lastBackup ? (
          <Row
            icon={HardDrive}
            title={t('Download {name}', { name: lastBackup.split('/').pop() ?? '' })}
            onPress={() => downloadBackup(lastBackup)}
          />
        ) : null}
        <Row
          icon={HardDrive}
          title={t('Download a backup by path')}
          onPress={async () => {
            const path = await prompt(t('Backup archive path on the backend'), { placeholder: '/home/me/hermes-backup.zip' })
            if (path) await downloadBackup(path)
          }}
          last
        />
      </Section>

      <Section title={t('Maintenance')}>
        <ToggleRow
          icon={Sparkles}
          title={t('Skill curator')}
          subtitle={
            curator.data
              ? t('Tidies stale skills every {h}h · last run {when}', {
                  h: curator.data.interval_hours ?? '?',
                  when: dateTime(curator.data.last_run_at) || t('never'),
                })
              : undefined
          }
          value={!!curator.data && !curator.data.paused}
          onChange={async (v) => {
            try {
              await rest().put('/api/curator/paused', { paused: !v })
              void curator.refetch()
            } catch (e) {
              toastError(e)
            }
          }}
        />
        <Row icon={Sparkles} title={t('Run the curator now')} onPress={start(t('Curator'), '/api/curator/run')} />
        <Row
          icon={Eraser}
          title={t('Prune checkpoints')}
          subtitle={t('{size} of file snapshots', { size: bytes(checkpoints.data?.total_bytes ?? 0) })}
          onPress={start(t('Pruning checkpoints'), '/api/ops/checkpoints/prune')}
        />
        <Row
          icon={ListX}
          title={t('Delete empty sessions')}
          subtitle={
            sessionStats.data
              ? t('{n} sessions, {m} messages in total', { n: sessionStats.data.total, m: sessionStats.data.messages })
              : undefined
          }
          onPress={async () => {
            try {
              const count = await rest().get<{ count: number }>('/api/sessions/empty/count')
              if (!count.count) return toast(t('No empty sessions'), 'info')
              if (
                !(await confirm(t('Delete {n} empty sessions?', { n: count.count }), undefined, {
                  destructive: true,
                  confirmLabel: t('Delete'),
                }))
              )
                return
              await rest().del('/api/sessions/empty')
              toast(t('Deleted'), 'success')
              void queryClient.invalidateQueries({ queryKey: ['sessions'] })
            } catch (e) {
              toastError(e)
            }
          }}
        />
        <Row
          icon={Trash2}
          title={t('Prune old sessions')}
          onPress={async () => {
            const days = await prompt(t('Delete sessions older than how many days?'), { initial: '90' })
            if (!days || Number.isNaN(Number(days))) return
            if (
              !(await confirm(t('Delete sessions older than {n} days?', { n: days }), undefined, {
                destructive: true,
                confirmLabel: t('Delete'),
              }))
            )
              return
            try {
              const res = await rest().post<{ deleted?: number; removed?: number }>('/api/sessions/prune', {
                older_than_days: Number(days),
              })
              toast(t('Deleted {n} sessions', { n: res.deleted ?? res.removed ?? 0 }), 'success')
              void queryClient.invalidateQueries({ queryKey: ['sessions'] })
            } catch (e) {
              toastError(e)
            }
          }}
        />
        <Row
          icon={Webhook}
          title={t('Lifecycle hooks')}
          subtitle={t('Shell commands that run on agent events')}
          onPress={() => setHooksOpen(true)}
          last
        />
      </Section>

      <ActionRunner
        action={action}
        onClose={() => setAction(null)}
        onDone={(lines) => {
          const m = lines.join('').match(/(\/[^\s'"]+\.zip)/)
          if (action?.name?.includes('backup') && m) setLastBackup(m[1])
          void queryClient.invalidateQueries({ queryKey: ['system'] })
        }}
      />
      <HooksSheet visible={hooksOpen} onClose={() => setHooksOpen(false)} />
    </Screen>
  )
}

function HooksSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT()
  const q = useRest<{ hooks: { event: string; command: string; matcher?: string | null; approved?: boolean }[]; valid_events: string[] }>(
    ['system', 'hooks'],
    '/api/ops/hooks',
    undefined,
    { enabled: visible },
  )
  const [event, setEvent] = useState('on_session_end')
  const [command, setCommand] = useState('')
  const [matcher, setMatcher] = useState('')
  const add = async () => {
    try {
      await rest().post('/api/ops/hooks', { event, command, matcher: matcher || null, approve: true })
      setCommand('')
      void q.refetch()
    } catch (e) {
      toastError(e)
    }
  }
  return (
    <Sheet visible={visible} onClose={onClose} title={t('Lifecycle hooks')}>
      {q.isLoading ? <Loading /> : null}
      {(q.data?.hooks ?? []).map((h, i) => (
        <View key={`${h.event}-${i}`} style={{ marginHorizontal: -space.lg }}>
          <Row
            title={h.event}
            subtitle={h.command}
            mono
            right={
              <Button
                size="sm"
                variant="dangerGhost"
                label={t('Remove')}
                onPress={async () => {
                  try {
                    await rest().del('/api/ops/hooks', { event: h.event, command: h.command })
                    void q.refetch()
                  } catch (e) {
                    toastError(e)
                  }
                }}
              />
            }
          />
        </View>
      ))}
      {!q.isLoading && !q.data?.hooks.length ? <Text tone="muted">{t('No hooks yet.')}</Text> : null}
      <Text weight="semibold">{t('Add a hook')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        {(q.data?.valid_events ?? []).map((e) => (
          <Chip key={e} label={e} selected={event === e} onPress={() => setEvent(e)} />
        ))}
      </View>
      <TextField
        label={t('Command')}
        value={command}
        onChangeText={setCommand}
        mono
        autoCapitalize="none"
        placeholder="notify-send 'Hermes finished'"
      />
      <TextField
        label={t('Matcher (optional)')}
        value={matcher}
        onChangeText={setMatcher}
        mono
        autoCapitalize="none"
        helper={t('e.g. a tool name for post_tool_call')}
      />
      <Button label={t('Add hook')} onPress={add} disabled={!command.trim()} />
    </Sheet>
  )
}
