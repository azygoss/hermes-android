import { router, Stack } from 'expo-router'
import { Plus, Users } from '@/components/icons'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { useProfiles } from '@/components/ProfileSwitcher'
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  IconButton,
  Loading,
  Screen,
  Sheet,
  Text,
  TextField,
  toast,
  toastError,
} from '@/components/ui'
import { useT } from '@/i18n'
import { relativeTime } from '@/lib/format'
import { useRpc } from '@/lib/hooks'
import { rpc, useProfile } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { radius, space, useTheme } from '@/theme'

/** Hosted rooms: group chats where several profiles (bots) discuss with you. */
export default function GroupsScreen() {
  const t = useT()
  const { c } = useTheme()
  const profile = useProfile()
  const q = useRpc(['groups', profile], 'groups.list', { profile, limit: 50 })
  const [creating, setCreating] = useState(false)

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Stack.Screen
        options={{
          title: t('Group rooms'),
          headerRight: () => <IconButton icon={Plus} label={t('New room')} onPress={() => setCreating(true)} />,
        }}
      />
      <Text tone="muted" variant="small">
        {t('A room puts several of your agent profiles in one conversation. They reply in turn and can work on tasks together.')}
      </Text>
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
      {(q.data?.rooms ?? []).map((room) => (
        <Pressable
          key={room.room_id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/groups/[id]', params: { id: room.room_id } })}
          style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, opacity: room.disbanded_at ? 0.5 : 1 }]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Users size={18} color={c.textMuted} strokeWidth={1.75} />
            <Text weight="semibold" style={{ flex: 1 }}>
              {room.name}
            </Text>
            <Text variant="caption" tone="faint">
              {relativeTime(room.updated_at)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
            {room.members.map((m, i) => (
              <Badge key={i} label={String(m.display_name || m.handle || m.profile || '?')} tone="info" />
            ))}
          </View>
        </Pressable>
      ))}
      {!q.isLoading && !q.data?.rooms.length ? (
        <EmptyState icon={Users} title={t('No rooms yet')} action={<Button label={t('New room')} onPress={() => setCreating(true)} />} />
      ) : null}
      <CreateRoom visible={creating} onClose={() => setCreating(false)} />
    </Screen>
  )
}

function CreateRoom({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT()
  const profiles = useProfiles()
  const [name, setName] = useState('')
  const [members, setMembers] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    try {
      const slug =
        name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'room'
      const roomId = `${slug}-${Date.now().toString(36)}`
      const res = await rpc().request('groups.create', {
        room_id: roomId,
        name: name.trim(),
        members: members.map((p) => ({ profile: p, handle: p, display_name: p })),
      })
      toast(t('Room created'), 'success')
      await queryClient.invalidateQueries({ queryKey: ['groups'] })
      onClose()
      router.push({ pathname: '/groups/[id]', params: { id: res.room.room_id } })
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('New room')}
      footer={<Button label={t('Create room')} onPress={create} loading={busy} disabled={!name.trim() || !members.length} />}
    >
      <TextField label={t('Name')} value={name} onChangeText={setName} placeholder={t('Product brainstorm')} />
      <Text variant="small" weight="medium" tone="muted">
        {t('Members (profiles)')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        {(profiles.data ?? []).map((p) => (
          <Chip
            key={p.name}
            label={p.name}
            selected={members.includes(p.name)}
            onPress={() => setMembers((cur) => (cur.includes(p.name) ? cur.filter((x) => x !== p.name) : [...cur, p.name]))}
          />
        ))}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.md, gap: space.sm },
})
