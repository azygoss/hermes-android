import { Stack, useLocalSearchParams } from 'expo-router'
import { History, RotateCcw } from '@/components/icons'
import { useState } from 'react'
import { ScrollView, View } from 'react-native'

import { Button, confirm, EmptyState, ErrorState, Loading, Row, Screen, Section, Sheet, Text, toast, toastError } from '@/components/ui'
import { useT } from '@/i18n'
import { dateTime } from '@/lib/format'
import { useRpc } from '@/lib/hooks'
import { rpc } from '@/lib/hermes'
import { loadHistory } from '@/store/chat'
import { radius, space, useTheme } from '@/theme'

export default function RollbackScreen() {
  const t = useT()
  const { c } = useTheme()
  const { sid } = useLocalSearchParams<{ sid: string }>()
  const q = useRpc(['rollback.list', sid], 'rollback.list', { session_id: sid })
  const [diff, setDiff] = useState<{ hash: string; text: string; stat?: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function openDiff(hash: string) {
    try {
      const res = await rpc().request('rollback.diff', { session_id: sid, hash })
      setDiff({ hash, text: res.diff ?? '', stat: res.stat })
    } catch (e) {
      toastError(e)
    }
  }

  async function restore(hash: string, filePath?: string) {
    if (
      !(await confirm(
        t('Restore this checkpoint?'),
        t('Files in the working tree are reset to this snapshot. Your later edits may be lost.'),
        { destructive: true, confirmLabel: t('Restore') },
      ))
    )
      return
    setBusy(true)
    try {
      const res = await rpc().request('rollback.restore', { session_id: sid, hash, file_path: filePath ?? null })
      if (!res.success) throw new Error(res.error || res.reason || t('Restore failed'))
      toast(t('Restored {n} files', { n: res.restored_files?.length ?? 0 }), 'success')
      if (res.history_removed) await loadHistory(sid)
      setDiff(null)
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Stack.Screen options={{ title: t('Checkpoints') }} />
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
      {q.data && !q.data.enabled ? (
        <EmptyState
          icon={History}
          title={t('Checkpoints are off')}
          body={t('Enable checkpoints in the backend config (checkpoints.enabled: true) to snapshot files before the agent edits them.')}
        />
      ) : null}
      {q.data?.enabled && !(q.data.checkpoints ?? []).length ? <EmptyState icon={History} title={t('No checkpoints yet')} /> : null}
      {(q.data?.checkpoints ?? []).length ? (
        <Section title={t('Snapshots of the working tree')}>
          {(q.data?.checkpoints ?? []).map((cp, i, all) => (
            <Row
              key={cp.hash ?? i}
              icon={RotateCcw}
              title={cp.message || cp.hash?.slice(0, 10) || '?'}
              subtitle={`${dateTime(cp.timestamp)} · ${cp.hash?.slice(0, 10)}`}
              onPress={() => cp.hash && openDiff(cp.hash)}
              last={i === all.length - 1}
            />
          ))}
        </Section>
      ) : null}
      <Sheet
        visible={!!diff}
        onClose={() => setDiff(null)}
        title={t('Changes since this checkpoint')}
        footer={diff ? <Button label={t('Restore everything')} variant="danger" loading={busy} onPress={() => restore(diff.hash)} /> : null}
      >
        {diff?.stat ? (
          <Text mono variant="caption" tone="muted">
            {diff.stat}
          </Text>
        ) : null}
        <ScrollView horizontal style={{ backgroundColor: c.codeBg, borderRadius: radius.sm }}>
          <View style={{ padding: space.sm }}>
            {(diff?.text || t('No differences.'))
              .split('\n')
              .slice(0, 800)
              .map((line, i) => (
                <Text
                  key={i}
                  mono
                  variant="caption"
                  style={{
                    color: line.startsWith('+')
                      ? c.success
                      : line.startsWith('-')
                        ? c.danger
                        : line.startsWith('@@')
                          ? c.info
                          : c.textMuted,
                  }}
                >
                  {line || ' '}
                </Text>
              ))}
          </View>
        </ScrollView>
      </Sheet>
    </Screen>
  )
}
