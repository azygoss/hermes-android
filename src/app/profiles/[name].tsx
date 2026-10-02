import * as ImagePicker from 'expo-image-picker'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { Cpu, Download, Pencil, Smartphone, Sparkles, Star, Terminal, Trash2, Wand2 } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Switch, View } from 'react-native'

import { ModelChooser } from '@/components/ModelChooser'
import { ProfileAvatar } from '@/components/ProfileAvatar'
import {
  Button,
  confirm,
  ErrorState,
  Loading,
  prompt,
  Row,
  Screen,
  Section,
  Segmented,
  Text,
  TextField,
  toast,
  toastError,
} from '@/components/ui'
import { useT } from '@/i18n'
import type { ProfilesConfigureParams } from '@/lib/gateway/contract.generated'
import { useRpc } from '@/lib/hooks'
import { rest, rpc } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { resetChat } from '@/store/chat'
import { useConnections } from '@/store/connections'
import { space, useTheme } from '@/theme'

export default function ProfileDetail() {
  const t = useT()
  const { c } = useTheme()
  const { name } = useLocalSearchParams<{ name: string }>()
  const q = useRpc(['profile', name], 'profiles.describe', { name })
  const [soul, setSoul] = useState('')
  const [description, setDescription] = useState('')
  const [tab, setTab] = useState<'skills' | 'toolsets' | 'mcp'>('toolsets')
  const [choosing, setChoosing] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const conn = useConnections((s) => s.connections.find((x) => x.id === s.activeId))

  useEffect(() => {
    setSoul(q.data?.soul ?? '')
    setDescription(q.data?.description ?? '')
  }, [q.data?.soul, q.data?.description])

  const configure = async (key: string, patch: Omit<ProfilesConfigureParams, 'name'>) => {
    setSaving(key)
    try {
      let res = await rpc().request('profiles.configure', { name, ...patch })
      if (res.confirm_required) {
        if (!(await confirm(res.confirm_message ?? t('This model is expensive. Use it anyway?')))) return
        res = await rpc().request('profiles.configure', { name, ...patch, confirm_expensive_model: true })
      }
      toast(t('Saved'), 'success')
      await Promise.all([q.refetch(), queryClient.invalidateQueries({ queryKey: ['profiles'] })])
    } catch (e) {
      toastError(e)
    } finally {
      setSaving(null)
    }
  }

  const d = q.data
  const disabledSkills = (d?.skills ?? []).filter((s) => s.enabled === false).map((s) => s.name)
  const enabledToolsets = (d?.toolsets ?? []).filter((s) => s.enabled !== false).map((s) => s.name)
  const enabledMcp = (d?.mcp_servers ?? []).filter((s) => s.enabled !== false).map((s) => s.name)

  async function pickAvatar() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    })
    if (res.canceled || !res.assets[0]?.base64) return
    try {
      const a = res.assets[0]
      await rpc().request('profiles.set_asset', { name, asset: 'avatar', data: `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` })
      await queryClient.invalidateQueries({ queryKey: ['profile-avatar', name] })
      toast(t('Avatar updated'), 'success')
    } catch (e) {
      toastError(e)
    }
  }

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Stack.Screen options={{ title: name }} />
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Change avatar')} onPress={pickAvatar}>
          <ProfileAvatar name={name} size={72} />
        </Pressable>
        <View style={{ flex: 1, gap: space.xs }}>
          <Text variant="h2">{name}</Text>
          <Text variant="small" tone="muted">
            {d?.model?.default ? `${d.model.default} · ${d.model.provider}` : t('Uses the global model')}
          </Text>
        </View>
      </View>

      <Section title={t('Use')}>
        <Row
          icon={Smartphone}
          title={t('Work in this profile on this phone')}
          onPress={() => {
            if (!conn) return
            useConnections.getState().setProfile(conn.id, name === 'default' ? null : name)
            resetChat()
            void queryClient.invalidateQueries()
            toast(t('Switched to profile {name}', { name }), 'success')
            router.navigate('/chat')
          }}
        />
        <Row
          icon={Star}
          title={t('Make it the default on the backend')}
          subtitle={t('Used by the CLI and new gateway sessions')}
          onPress={async () => {
            try {
              await rest().post('/api/profiles/active', { name }, { noProfile: true })
              toast(t('{name} is now the default profile', { name }), 'success')
            } catch (e) {
              toastError(e)
            }
          }}
        />
        <Row
          icon={Terminal}
          title={t('Show setup command')}
          onPress={async () => {
            try {
              const res = await rest().get<{ command?: string }>(`/api/profiles/${encodeURIComponent(name)}/setup-command`, {
                noProfile: true,
              })
              await prompt(t('Run this on the backend'), { initial: res.command ?? '', multiline: true })
            } catch (e) {
              toastError(e)
            }
          }}
          last
        />
      </Section>

      <Section title={t('Description')}>
        <View style={{ padding: space.lg, gap: space.sm }}>
          <TextField value={description} onChangeText={setDescription} multiline minLines={2} placeholder={t('What this agent is for')} />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button
              size="sm"
              label={t('Save')}
              loading={saving === 'description'}
              onPress={() => configure('description', { description })}
            />
            <Button
              size="sm"
              variant="secondary"
              icon={Wand2}
              label={t('Write one for me')}
              onPress={async () => {
                try {
                  const res = await rest().post<{ description?: string }>(
                    `/api/profiles/${encodeURIComponent(name)}/describe-auto`,
                    {},
                    { noProfile: true, timeoutMs: 120_000 },
                  )
                  if (res.description) setDescription(res.description)
                } catch (e) {
                  toastError(e)
                }
              }}
            />
          </View>
        </View>
      </Section>

      <Section title={t('Personality — SOUL.md')}>
        <View style={{ padding: space.lg, gap: space.sm }}>
          <TextField value={soul} onChangeText={setSoul} multiline minLines={8} />
          <Button
            size="sm"
            label={t('Save personality')}
            loading={saving === 'soul'}
            onPress={() => configure('soul', { soul })}
            style={{ alignSelf: 'flex-start' }}
          />
        </View>
      </Section>

      <Section title={t('Model')}>
        <Row
          icon={Cpu}
          title={d?.model?.default || t('Global default')}
          subtitle={d?.model?.provider}
          onPress={() => setChoosing(true)}
          last
        />
      </Section>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'toolsets', label: t('Toolsets') },
          { value: 'skills', label: t('Skills') },
          { value: 'mcp', label: 'MCP' },
        ]}
      />
      <Section>
        {tab === 'toolsets'
          ? (d?.toolsets ?? []).map((ts, i, all) => (
              <Toggle
                key={ts.name}
                title={ts.label || ts.name}
                subtitle={ts.description}
                value={ts.enabled !== false}
                last={i === all.length - 1}
                onChange={(v) =>
                  configure('toolsets', {
                    enabled_toolsets: v ? [...enabledToolsets, ts.name] : enabledToolsets.filter((x) => x !== ts.name),
                  })
                }
              />
            ))
          : tab === 'skills'
            ? (d?.skills ?? []).map((s, i, all) => (
                <Toggle
                  key={s.name}
                  icon
                  title={s.name}
                  value={s.enabled !== false}
                  last={i === all.length - 1}
                  onChange={(v) =>
                    configure('skills', { disabled_skills: v ? disabledSkills.filter((x) => x !== s.name) : [...disabledSkills, s.name] })
                  }
                />
              ))
            : (d?.mcp_servers ?? []).map((m, i, all) => (
                <Toggle
                  key={m.name}
                  title={m.name}
                  subtitle={m.transport}
                  value={m.enabled !== false}
                  last={i === all.length - 1}
                  onChange={(v) =>
                    configure('mcp', { enabled_mcp_servers: v ? [...enabledMcp, m.name] : enabledMcp.filter((x) => x !== m.name) })
                  }
                />
              ))}
        {tab === 'mcp' && !d?.mcp_servers?.length ? (
          <View style={{ padding: space.lg }}>
            <Text tone="muted">{t('No MCP servers configured.')}</Text>
          </View>
        ) : null}
      </Section>

      <Section title={t('Manage')}>
        <Row
          icon={Pencil}
          title={t('Rename')}
          onPress={async () => {
            const next = await prompt(t('Rename profile'), { initial: name })
            if (!next || next === name) return
            try {
              await rest().patch(`/api/profiles/${encodeURIComponent(name)}`, { new_name: next }, { noProfile: true })
              await queryClient.invalidateQueries({ queryKey: ['profiles'] })
              router.replace({ pathname: '/profiles/[name]', params: { name: next } })
            } catch (e) {
              toastError(e)
            }
          }}
        />
        <Row
          icon={Download}
          title={t('Export as archive')}
          subtitle={t('Saved on the backend; share it to clone this agent elsewhere')}
          onPress={async () => {
            try {
              const res = await rest().post<{ archive?: string; path?: string; message?: string }>(
                `/api/profiles/${encodeURIComponent(name)}/export`,
                {},
                { noProfile: true, timeoutMs: 120_000 },
              )
              toast(t('Exported to {path}', { path: res.archive ?? res.path ?? '' }), 'success')
            } catch (e) {
              toastError(e)
            }
          }}
        />
        <Row
          icon={Trash2}
          danger
          title={t('Delete profile')}
          last
          onPress={async () => {
            if (
              !(await confirm(t('Delete {name}?', { name }), t('Its memory, skills and sessions are deleted from the backend.'), {
                destructive: true,
                confirmLabel: t('Delete'),
              }))
            )
              return
            try {
              await rest().del(`/api/profiles/${encodeURIComponent(name)}`, undefined, { noProfile: true })
              await queryClient.invalidateQueries({ queryKey: ['profiles'] })
              router.back()
            } catch (e) {
              toastError(e)
            }
          }}
        />
      </Section>
      <ModelChooser
        visible={choosing}
        title={t('Model for {name}', { name })}
        onClose={() => setChoosing(false)}
        onPick={(provider, model) => configure('model', { model, provider })}
      />
    </Screen>
  )
}

function Toggle({
  title,
  subtitle,
  value,
  onChange,
  last,
  icon,
}: {
  title: string
  subtitle?: string
  value: boolean
  onChange: (v: boolean) => void
  last?: boolean
  icon?: boolean
}) {
  const { c } = useTheme()
  return (
    <View style={[styles.toggle, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
      {icon ? <Sparkles size={14} color={c.textFaint} /> : null}
      <View style={{ flex: 1 }}>
        <Text weight="medium" mono={icon}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: c.borderStrong, true: c.accent }}
        thumbColor={value ? c.onAccent : c.textMuted}
        accessibilityLabel={title}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    minHeight: 52,
  },
})
