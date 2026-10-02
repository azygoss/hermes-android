import { useInfiniteQuery } from '@tanstack/react-query'
import { router, Stack } from 'expo-router'
import { Download } from '@/components/icons'
import { useState } from 'react'
import { FlatList, Pressable, StyleSheet, View } from 'react-native'

import { Button, EmptyState, ErrorState, Loading, Sheet, Text, toast, toastError } from '@/components/ui'
import { useT } from '@/i18n'
import { relativeTime } from '@/lib/format'
import type { ForeignSessionRow } from '@/lib/gateway/contract.generated'
import { useRpc } from '@/lib/hooks'
import { hermes, rpc, useRuntime, useProfile } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { radius, space, useTheme } from '@/theme'

export default function ImportScreen() {
  const t = useT()
  const { c } = useTheme()
  const open = useRuntime((s) => s.state === 'open')
  const profile = useProfile()
  const [selected, setSelected] = useState<ForeignSessionRow | null>(null)
  const list = useInfiniteQuery({
    queryKey: ['foreign-sessions', profile],
    enabled: open,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => rpc().request('session.foreign.list', { offset: pageParam, limit: 30, profile }),
    getNextPageParam: (last) => last.next_offset ?? undefined,
  })
  const rows = list.data?.pages.flatMap((p) => p.sessions ?? []) ?? []

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: t('Import sessions') }} />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: space.lg, gap: space.sm }}
        ListHeaderComponent={
          <View style={{ gap: space.sm, paddingBottom: space.sm }}>
            <Text tone="muted" variant="small">
              {t(
                'Claude Code and Codex sessions found on {host}. Importing copies the conversation into Hermes so you can continue it here.',
                {
                  host: list.data?.pages[0]?.host ?? t('the backend'),
                },
              )}
            </Text>
            {list.isLoading ? <Loading /> : null}
            {list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : null}
          </View>
        }
        onEndReached={() => list.hasNextPage && list.fetchNextPage()}
        ListEmptyComponent={!list.isLoading ? <EmptyState icon={Download} title={t('Nothing to import')} /> : null}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelected(item)}
            style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
          >
            <Text weight="medium" numberOfLines={2}>
              {item.title || item.excerpt}
            </Text>
            <Text variant="caption" tone="faint">
              {item.label} · {relativeTime(item.mtime)} · {t('{n} turns', { n: item.turn_count ?? 0 })}
            </Text>
            {item.cwd ? (
              <Text variant="caption" tone="muted" mono numberOfLines={1}>
                {item.cwd}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
      <PreviewSheet row={selected} onClose={() => setSelected(null)} />
    </View>
  )
}

function PreviewSheet({ row, onClose }: { row: ForeignSessionRow | null; onClose: () => void }) {
  const t = useT()
  const { c } = useTheme()
  const [busy, setBusy] = useState(false)
  const profile = useProfile()
  const preview = useRpc(['foreign-preview', row?.id], 'session.foreign.preview', { id: row?.id ?? '', profile }, { enabled: !!row })
  const doImport = async () => {
    if (!row) return
    setBusy(true)
    try {
      const res = await rpc().request('session.foreign.import', { id: row.id, profile: hermes().profile }, { timeoutMs: 120_000 })
      toast(res.already_imported ? t('Already imported') : t('Imported'), 'success')
      await queryClient.invalidateQueries({ queryKey: ['sessions'] })
      onClose()
      router.navigate({ pathname: '/chat', params: { stored: res.session_id } })
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet
      visible={!!row}
      onClose={onClose}
      title={row?.title || t('Session')}
      footer={
        <Button
          label={preview.data?.already_imported ? t('Open the imported chat') : t('Import and open')}
          onPress={doImport}
          loading={busy}
        />
      }
    >
      {preview.isLoading ? <Loading /> : null}
      {(preview.data?.messages ?? []).map((m, i) => (
        <View
          key={i}
          style={{ backgroundColor: m.role === 'user' ? c.userBubble : c.surfaceAlt, borderRadius: radius.md, padding: space.md, gap: 4 }}
        >
          <Text variant="caption" tone="faint" weight="semibold">
            {m.role}
          </Text>
          <Text variant="small" numberOfLines={12}>
            {m.content}
          </Text>
        </View>
      ))}
      {preview.data?.truncated ? (
        <Text variant="caption" tone="faint">
          {t('Showing the last turns of {n}.', { n: preview.data.total ?? 0 })}
        </Text>
      ) : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.md, gap: 6 },
})
