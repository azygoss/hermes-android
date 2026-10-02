import { Stack } from 'expo-router'
import { Brain, Map as MapIcon, Pin, Sparkles } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { LearningNodeSheet, type LearningNode } from '@/components/LearningNodeSheet'
import { Badge, Card, EmptyState, ErrorState, Loading, Screen, Segmented, Text } from '@/components/ui'
import { useT } from '@/i18n'
import { useRest } from '@/lib/hooks'
import { radius, space, useTheme } from '@/theme'

interface Graph {
  nodes: LearningNode[]
  edges: unknown[]
  clusters: { category: string; count: number }[]
  stats: { nodes?: number; learned_skills?: number; memory_nodes?: number; agent_created?: number; used?: number; categories?: number }
}

export default function JourneyScreen() {
  const t = useT()
  const { c } = useTheme()
  const graph = useRest<Graph>(['learning-graph'], '/api/learning/graph')
  const [kind, setKind] = useState<'all' | 'skill' | 'memory'>('all')
  const [node, setNode] = useState<LearningNode | null>(null)

  const days = useMemo(() => {
    const nodes = (graph.data?.nodes ?? []).filter((n) => kind === 'all' || n.kind === kind)
    const map = new Map<string, LearningNode[]>()
    for (const n of nodes.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))) {
      const day = n.timestamp ? new Date(n.timestamp * 1000).toDateString() : t('Unknown date')
      map.set(day, [...(map.get(day) ?? []), n])
    }
    return [...map.entries()]
  }, [graph.data, kind, t])

  const s = graph.data?.stats ?? {}
  return (
    <Screen refreshing={graph.isRefetching} onRefresh={() => graph.refetch()}>
      <Stack.Screen options={{ title: t('Learning journey') }} />
      {graph.isLoading ? <Loading /> : null}
      {graph.error ? <ErrorState error={graph.error} onRetry={() => graph.refetch()} /> : null}
      {graph.data ? (
        <View style={styles.stats}>
          <Stat label={t('Skills learned')} value={s.learned_skills ?? 0} />
          <Stat label={t('Memories')} value={s.memory_nodes ?? 0} />
          <Stat label={t('Categories')} value={s.categories ?? 0} />
        </View>
      ) : null}
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'all', label: t('All') },
          { value: 'skill', label: t('Skills') },
          { value: 'memory', label: t('Memories') },
        ]}
      />
      {!days.length && !graph.isLoading ? (
        <EmptyState
          icon={MapIcon}
          title={t('No learning yet')}
          body={t('Keep using Hermes; the skills and memories it picks up map out here.')}
        />
      ) : null}
      {days.map(([day, nodes]) => (
        <View key={day} style={{ gap: space.sm }}>
          <Text variant="small" weight="semibold" tone="muted">
            {day}
          </Text>
          <View style={{ borderLeftWidth: 2, borderLeftColor: c.border, marginLeft: 8, paddingLeft: space.lg, gap: space.sm }}>
            {nodes.map((n) => {
              const Icon = n.kind === 'skill' ? Sparkles : Brain
              return (
                <Pressable
                  key={n.id}
                  accessibilityRole="button"
                  onPress={() => setNode(n)}
                  style={[styles.node, { backgroundColor: c.surface, borderColor: c.border }]}
                >
                  <View style={[styles.dot, { backgroundColor: n.kind === 'skill' ? c.accent : c.info, left: -space.lg - 7 }]} />
                  <Icon size={16} color={n.kind === 'skill' ? c.accentText : c.info} />
                  <View style={{ flex: 1 }}>
                    <Text weight="medium" numberOfLines={2}>
                      {n.label}
                    </Text>
                    <Text variant="caption" tone="faint">
                      {[n.category, n.createdBy, n.useCount ? t('used {n}×', { n: n.useCount }) : null].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  {n.pinned ? <Pin size={14} color={c.textMuted} /> : null}
                  {n.state && n.state !== 'active' ? <Badge label={n.state} /> : null}
                </Pressable>
              )
            })}
          </View>
        </View>
      ))}
      <LearningNodeSheet node={node} onClose={() => setNode(null)} />
    </Screen>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card style={{ flex: 1, padding: space.md, gap: 2 }}>
      <Text variant="h2">{value}</Text>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </Card>
  )
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: space.sm },
  node: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.md,
  },
  dot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, top: 18 },
})
