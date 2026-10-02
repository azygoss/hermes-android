import { router, Stack } from 'expo-router'
import { Check, Plus, UserCircle2 } from '@/components/icons'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { ProfileAvatar } from '@/components/ProfileAvatar'
import { useProfiles } from '@/components/ProfileSwitcher'
import {
  Button,
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
  ToggleRow,
} from '@/components/ui'
import { useT } from '@/i18n'
import { relativeTime } from '@/lib/format'
import { rpc } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { useConnections } from '@/store/connections'
import { radius, space, useTheme } from '@/theme'

export default function ProfilesScreen() {
  const t = useT()
  const { c } = useTheme()
  const profiles = useProfiles()
  const current = useConnections((s) => s.connections.find((x) => x.id === s.activeId)?.profile ?? null)
  const [creating, setCreating] = useState(false)

  return (
    <Screen refreshing={profiles.isRefetching} onRefresh={() => profiles.refetch()}>
      <Stack.Screen
        options={{
          title: t('Profiles'),
          headerRight: () => <IconButton icon={Plus} label={t('New profile')} onPress={() => setCreating(true)} />,
        }}
      />
      <Text tone="muted" variant="small">
        {t('Each profile is an independent agent: its own SOUL.md personality, model, memory, skills and sessions.')}
      </Text>
      {profiles.isLoading ? <Loading /> : null}
      {profiles.error ? <ErrorState error={profiles.error} onRetry={() => profiles.refetch()} /> : null}
      {(profiles.data ?? []).map((p) => {
        const onPhone = current ? p.name === current : !!p.is_default
        const last = (p as { last_session?: { title?: string; last_active?: number } }).last_session
        return (
          <Pressable
            key={p.name}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/profiles/[name]', params: { name: p.name } })}
            style={({ pressed }) => [styles.card, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
          >
            <ProfileAvatar name={p.name} size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' }}>
                <Text weight="semibold">{p.display_name || p.name}</Text>
                {onPhone ? <Check size={16} color={c.accentText} strokeWidth={2} accessibilityLabel={t('on this phone')} /> : null}
              </View>
              <Text variant="small" tone="muted" numberOfLines={2}>
                {[p.description || p.model, p.is_default ? t('default') : null].filter(Boolean).join(' · ')}
              </Text>
              {last?.title ? (
                <Text variant="caption" tone="faint" numberOfLines={1}>
                  {t('Last: {title} · {when}', { title: last.title, when: relativeTime(last.last_active) })}
                </Text>
              ) : null}
            </View>
          </Pressable>
        )
      })}
      {!profiles.isLoading && !profiles.data?.length ? <EmptyState icon={UserCircle2} title={t('No profiles')} /> : null}
      <CreateProfile visible={creating} onClose={() => setCreating(false)} sources={(profiles.data ?? []).map((p) => p.name)} />
    </Screen>
  )
}

function CreateProfile({ visible, onClose, sources }: { visible: boolean; onClose: () => void; sources: string[] }) {
  const t = useT()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [soul, setSoul] = useState('')
  const [clone, setClone] = useState(true)
  const [busy, setBusy] = useState(false)

  async function create() {
    setBusy(true)
    try {
      const res = await rpc().request('profiles.create', {
        name: name.trim(),
        description: description.trim() || null,
        soul: soul.trim() || null,
        clone_from: clone ? (sources[0] ?? 'default') : null,
        mirror_credentials: true,
      })
      toast(t('Profile {name} created', { name: res.name }), 'success')
      await queryClient.invalidateQueries({ queryKey: ['profiles'] })
      onClose()
      router.push({ pathname: '/profiles/[name]', params: { name: res.name } })
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
      title={t('New profile')}
      footer={<Button label={t('Create')} onPress={create} loading={busy} disabled={!name.trim()} />}
    >
      <TextField
        label={t('Name')}
        value={name}
        onChangeText={setName}
        autoCapitalize="none"
        placeholder="researcher"
        helper={t('Letters, numbers and dashes.')}
      />
      <TextField label={t('Description')} value={description} onChangeText={setDescription} placeholder={t('What this agent is for')} />
      <TextField
        label={t('Personality (SOUL.md, optional)')}
        value={soul}
        onChangeText={setSoul}
        multiline
        minLines={5}
        placeholder={t('You are a meticulous research assistant…')}
      />
      <View style={{ marginHorizontal: -space.lg }}>
        <ToggleRow
          title={t('Copy settings from the current profile')}
          subtitle={t('Model, keys and config; memory and sessions start empty.')}
          value={clone}
          onChange={setClone}
          last
        />
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: space.md, alignItems: 'center', borderWidth: 1, borderRadius: radius.lg, padding: space.md },
})
