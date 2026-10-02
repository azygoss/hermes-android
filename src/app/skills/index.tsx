import { useQuery } from '@tanstack/react-query'
import { router, Stack } from 'expo-router'
import { Download, PackageCheck, Plus, RefreshCw, ShieldAlert, ShieldCheck, Sparkles } from '@/components/icons'
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { Markdown } from '@/components/chat/Markdown'
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  IconButton,
  Loading,
  Screen,
  Section,
  Segmented,
  Sheet,
  Text,
  TextField,
  toast,
  toastError,
  Toggle,
} from '@/components/ui'
import { useT } from '@/i18n'
import { useRest } from '@/lib/hooks'
import { hermes, rest, rpc } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { radius, space, useTheme } from '@/theme'

interface SkillInfo {
  name: string
  description: string
  category: string
  enabled: boolean
  usage?: number
  provenance?: string
}

interface HubResult {
  name: string
  description: string
  source: string
  identifier: string
  trust_level?: string
  repo?: string | null
  tags?: string[]
}

export default function SkillsScreen() {
  const t = useT()
  const { c } = useTheme()
  const [tab, setTab] = useState<'installed' | 'hub'>('installed')
  const [filter, setFilter] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const skills = useRest<SkillInfo[]>(['skills'], '/api/skills')
  const [busy, setBusy] = useState<string | null>(null)

  const categories = useMemo(() => [...new Set((skills.data ?? []).map((s) => s.category || 'other'))].sort(), [skills.data])
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return (skills.data ?? []).filter(
      (s) =>
        (!category || (s.category || 'other') === category) &&
        (!q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)),
    )
  }, [skills.data, filter, category])

  async function toggle(s: SkillInfo, enabled: boolean) {
    setBusy(s.name)
    queryClient.setQueryData<SkillInfo[]>(['skills'], (old) => old?.map((x) => (x.name === s.name ? { ...x, enabled } : x)))
    try {
      await rest().put('/api/skills/toggle', { name: s.name, enabled, profile: hermes().profile ?? undefined })
    } catch (e) {
      toastError(e)
      void skills.refetch()
    } finally {
      setBusy(null)
    }
  }

  return (
    <Screen refreshing={skills.isRefetching} onRefresh={() => skills.refetch()}>
      <Stack.Screen
        options={{
          title: t('Skills'),
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <IconButton
                icon={RefreshCw}
                label={t('Rescan skill folders')}
                onPress={async () => {
                  try {
                    const res = await rpc().request('skills.reload', {})
                    const r = res.result as { added?: string[]; removed?: string[]; total?: number } | undefined
                    toast(
                      t('{total} skills · {added} added · {removed} removed', {
                        total: r?.total ?? 0,
                        added: r?.added?.length ?? 0,
                        removed: r?.removed?.length ?? 0,
                      }),
                      'success',
                    )
                    void skills.refetch()
                  } catch (e) {
                    toastError(e)
                  }
                }}
              />
              <IconButton
                icon={Plus}
                label={t('New skill')}
                onPress={() => router.push({ pathname: '/skills/[name]', params: { name: '_new' } })}
              />
            </View>
          ),
        }}
      />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'installed', label: t('Installed ({n})', { n: skills.data?.length ?? 0 }) },
          { value: 'hub', label: t('Skills Hub') },
        ]}
      />
      {tab === 'installed' ? (
        <>
          <TextField placeholder={t('Filter skills')} value={filter} onChangeText={setFilter} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -space.lg }}
            contentContainerStyle={styles.chips}
          >
            <Chip label={t('All')} selected={!category} onPress={() => setCategory(null)} />
            {categories.map((cat) => (
              <Chip key={cat} label={cat} selected={category === cat} onPress={() => setCategory(category === cat ? null : cat)} />
            ))}
          </ScrollView>
          {skills.isLoading ? <Loading /> : null}
          {skills.error ? <ErrorState error={skills.error} onRetry={() => skills.refetch()} /> : null}
          {shown.length ? (
            <Section>
              {shown.map((s, i) => (
                <View
                  key={s.name}
                  style={[styles.row, i < shown.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${s.name}: ${s.description}`}
                    onPress={() => router.push({ pathname: '/skills/[name]', params: { name: s.name } })}
                    android_ripple={{ color: c.surfaceAlt }}
                    style={({ pressed }) => [styles.rowBody, pressed && { opacity: 0.7 }]}
                  >
                    <View style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Text weight="medium" mono>
                        {s.name}
                      </Text>
                      {s.provenance && s.provenance !== 'bundled' ? <Badge label={s.provenance} tone="info" /> : null}
                    </View>
                    <Text variant="small" tone="muted" numberOfLines={2}>
                      {s.description}
                    </Text>
                    <Text variant="caption" tone="faint">
                      {s.category}
                      {s.usage ? ` · ${t('used {n}×', { n: s.usage })}` : ''}
                    </Text>
                  </Pressable>
                  <Toggle
                    value={s.enabled}
                    disabled={busy === s.name}
                    onValueChange={(v) => toggle(s, v)}
                    accessibilityLabel={t('Enable {name}', { name: s.name })}
                    style={{ marginRight: space.lg }}
                  />
                </View>
              ))}
            </Section>
          ) : !skills.isLoading ? (
            <EmptyState icon={Sparkles} title={t('No skills match')} />
          ) : null}
        </>
      ) : (
        <HubTab installed={new Set((skills.data ?? []).map((s) => s.name))} />
      )}
    </Screen>
  )
}

function HubTab({ installed }: { installed: Set<string> }) {
  const t = useT()
  const { c } = useTheme()
  const [q, setQ] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [selected, setSelected] = useState<HubResult | null>(null)
  const sources = useRest<{ sources: { id: string; label: string; searchable?: boolean }[]; featured?: HubResult[] }>(
    ['skills-hub', 'sources'],
    '/api/skills/hub/sources',
  )
  const search = useQuery({
    queryKey: ['skills-hub', 'search', submitted],
    enabled: submitted.length > 1,
    queryFn: () =>
      rest().get<{ results: HubResult[]; timed_out?: string[] }>('/api/skills/hub/search', {
        query: { q: submitted, source: 'all', limit: 30 },
        timeoutMs: 60_000,
      }),
  })
  const items = submitted ? (search.data?.results ?? []) : (sources.data?.featured ?? [])

  return (
    <>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <TextField
            placeholder={t('Search skills, e.g. "github"')}
            value={q}
            onChangeText={setQ}
            returnKeyType="search"
            onSubmitEditing={() => setSubmitted(q.trim())}
            autoCapitalize="none"
          />
        </View>
        <Button label={t('Search')} onPress={() => setSubmitted(q.trim())} />
      </View>
      <Button
        label={t('Update installed hub skills')}
        icon={Download}
        variant="secondary"
        size="sm"
        style={{ alignSelf: 'flex-start' }}
        onPress={async () => {
          try {
            const res = await rest().post('/api/skills/hub/update', { profile: hermes().profile ?? undefined }, { timeoutMs: 180_000 })
            toast((res as { message?: string }).message ?? t('Update started'), 'success')
          } catch (e) {
            toastError(e)
          }
        }}
      />
      {sources.isLoading || search.isFetching ? <Loading label={search.isFetching ? t('Searching every hub…') : undefined} /> : null}
      {search.error ? <ErrorState error={search.error} /> : null}
      <Text variant="small" weight="semibold" tone="muted">
        {submitted ? t('Results for "{q}"', { q: submitted }) : t('Featured')}
      </Text>
      {items.map((item) => (
        <Pressable
          key={item.identifier}
          accessibilityRole="button"
          onPress={() => setSelected(item)}
          style={[styles.hubCard, { backgroundColor: c.surface, borderColor: c.border }]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text weight="semibold" style={{ flex: 1 }}>
              {item.name}
            </Text>
            {installed.has(item.name) ? <Badge label={t('installed')} tone="success" /> : null}
            {item.trust_level ? (
              <Badge
                label={item.trust_level}
                tone={item.trust_level === 'builtin' || item.trust_level === 'trusted' ? 'accent' : 'default'}
              />
            ) : null}
          </View>
          <Text variant="small" tone="muted" numberOfLines={3}>
            {item.description}
          </Text>
          <Text variant="caption" tone="faint" mono numberOfLines={1}>
            {item.identifier}
          </Text>
        </Pressable>
      ))}
      {submitted && !search.isFetching && !items.length ? <EmptyState icon={Sparkles} title={t('No skills found')} /> : null}
      <HubSheet item={selected} installed={!!selected && installed.has(selected.name)} onClose={() => setSelected(null)} />
    </>
  )
}

function HubSheet({ item, installed, onClose }: { item: HubResult | null; installed: boolean; onClose: () => void }) {
  const t = useT()
  const { c } = useTheme()
  const [busy, setBusy] = useState(false)
  const preview = useQuery({
    queryKey: ['skills-hub', 'preview', item?.identifier],
    enabled: !!item,
    queryFn: () =>
      rest().get<{ skill_md: string; files: string[] }>('/api/skills/hub/preview', {
        query: { identifier: item!.identifier },
        timeoutMs: 60_000,
      }),
  })
  const scan = useQuery({
    queryKey: ['skills-hub', 'scan', item?.identifier],
    enabled: false,
    queryFn: () =>
      rest().get<{
        verdict: string
        summary: string
        policy: string
        policy_reason: string
        findings: { severity?: string; message?: string; description?: string }[]
      }>('/api/skills/hub/scan', { query: { identifier: item!.identifier }, timeoutMs: 120_000 }),
  })

  async function install() {
    if (!item) return
    setBusy(true)
    try {
      const res = await rest().post(
        '/api/skills/hub/install',
        { identifier: item.identifier, profile: hermes().profile ?? undefined },
        { timeoutMs: 300_000 },
      )
      const r = res as { ok?: boolean; error?: string; message?: string }
      if (r.ok === false) throw new Error(r.error || r.message || t('Install failed'))
      toast(t('Installing {name}…', { name: item.name }), 'success')
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['skills'] }), 4000)
      onClose()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }

  async function uninstall() {
    if (!item) return
    setBusy(true)
    try {
      await rest().post('/api/skills/hub/uninstall', { name: item.name, profile: hermes().profile ?? undefined })
      toast(t('Uninstalled {name}', { name: item.name }), 'success')
      void queryClient.invalidateQueries({ queryKey: ['skills'] })
      onClose()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }

  const verdict = scan.data?.verdict
  return (
    <Sheet
      visible={!!item}
      onClose={onClose}
      title={item?.name}
      footer={
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button
            label={t('Security scan')}
            icon={ShieldCheck}
            variant="secondary"
            loading={scan.isFetching}
            onPress={() => scan.refetch()}
            style={{ flex: 1 }}
          />
          {installed ? (
            <Button label={t('Uninstall')} variant="danger" loading={busy} onPress={uninstall} style={{ flex: 1 }} />
          ) : (
            <Button
              label={t('Install')}
              icon={PackageCheck}
              loading={busy}
              onPress={install}
              disabled={scan.data?.policy === 'block'}
              style={{ flex: 1 }}
            />
          )}
        </View>
      }
    >
      <Text tone="muted">{item?.description}</Text>
      {scan.data ? (
        <View
          style={{
            borderRadius: radius.md,
            padding: space.md,
            gap: 4,
            backgroundColor: verdict === 'safe' ? c.successSoft : verdict === 'dangerous' ? c.dangerSoft : c.warnSoft,
          }}
        >
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            {verdict === 'safe' ? (
              <ShieldCheck size={16} color={c.success} />
            ) : (
              <ShieldAlert size={16} color={verdict === 'dangerous' ? c.danger : c.warn} />
            )}
            <Text weight="semibold">{t('Verdict: {v} · policy: {p}', { v: verdict ?? '?', p: scan.data.policy })}</Text>
          </View>
          <Text variant="small">{scan.data.summary}</Text>
          {scan.data.findings.slice(0, 8).map((f, i) => (
            <Text key={i} variant="caption" tone="muted">
              • {f.severity ? `[${f.severity}] ` : ''}
              {f.message ?? f.description}
            </Text>
          ))}
        </View>
      ) : null}
      {preview.isLoading ? <Loading /> : null}
      {preview.error ? <ErrorState error={preview.error} /> : null}
      {preview.data?.files?.length ? (
        <Text variant="caption" tone="faint" mono>
          {preview.data.files.join('  ')}
        </Text>
      ) : null}
      {preview.data?.skill_md ? <Markdown text={preview.data.skill_md} /> : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: space.xs, paddingHorizontal: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 64 },
  rowBody: { flex: 1, gap: 2, padding: space.lg, paddingRight: space.md },
  hubCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.md, gap: 4 },
})
