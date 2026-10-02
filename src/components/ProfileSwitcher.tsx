import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { Check, UserCircle2 } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, View } from 'react-native'

import { Badge, Button, Row, Section, Sheet, Text, toast } from '@/components/ui'
import { useT } from '@/i18n'
import { rpc, useRuntime } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { resetChat } from '@/store/chat'
import { useConnections } from '@/store/connections'
import { radius, space, useTheme } from '@/theme'

export interface ProfileRow {
  name: string
  path?: string
  is_default?: boolean
  model?: string | null
  provider?: string | null
  description?: string | null
  display_name?: string | null
  skill_count?: number
}

export function useProfiles() {
  const connected = useRuntime((s) => s.state === 'open')
  return useQuery({
    queryKey: ['profiles'],
    enabled: connected,
    queryFn: async () => ((await rpc().request('profiles.list', {})) as { profiles: ProfileRow[] }).profiles,
  })
}

/** Which Hermes profile this phone works in. Sessions, skills, memory and config follow it. */
export function ProfileSwitcher() {
  const t = useT()
  const { c } = useTheme()
  const [open, setOpen] = useState(false)
  const conn = useConnections((s) => s.connections.find((x) => x.id === s.activeId))
  const profiles = useProfiles()
  const current = conn?.profile ?? null
  const currentRow = profiles.data?.find((p) => (current ? p.name === current : p.is_default)) ?? null

  const choose = (name: string | null) => {
    if (!conn) return
    useConnections.getState().setProfile(conn.id, name)
    resetChat()
    void queryClient.invalidateQueries()
    setOpen(false)
    toast(t('Switched to profile {name}', { name: name ?? t('default') }), 'success')
  }

  return (
    <>
      <Section title={t('Profile')}>
        <Row
          icon={UserCircle2}
          title={currentRow?.display_name || currentRow?.name || current || t('default')}
          subtitle={
            [currentRow?.model, currentRow?.description].filter(Boolean).join(' · ') ||
            t('Each profile is a separate agent with its own memory, skills and config.')
          }
          value={profiles.data && profiles.data.length > 1 ? t('{n} profiles', { n: profiles.data.length }) : undefined}
          onPress={() => setOpen(true)}
          last
        />
      </Section>
      <Sheet visible={open} onClose={() => setOpen(false)} title={t('Switch profile')}>
        {(profiles.data ?? []).map((p) => {
          const on = current ? p.name === current : !!p.is_default
          return (
            <Pressable
              key={p.name}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => choose(p.is_default ? null : p.name)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                padding: space.md,
                borderRadius: radius.md,
                backgroundColor: on ? c.accentSoft : c.surfaceAlt,
                minHeight: 56,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text weight="semibold">{p.display_name || p.name}</Text>
                <Text variant="small" tone="muted" numberOfLines={2}>
                  {[p.model, p.description].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {p.is_default ? <Badge label={t('default')} /> : null}
              {on ? <Check size={18} color={c.accentText} /> : null}
            </Pressable>
          )
        })}
        <Button label={t('Manage profiles')} variant="secondary" onPress={() => (setOpen(false), router.push('/profiles'))} />
      </Sheet>
    </>
  )
}
