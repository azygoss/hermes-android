import { router, Stack, useLocalSearchParams } from 'expo-router'
import { Eye, Pencil, Save } from '@/components/icons'
import { useEffect, useState } from 'react'
import { View } from 'react-native'

import { Markdown } from '@/components/chat/Markdown'
import { Button, ErrorState, IconButton, Loading, Screen, Text, TextField, toast, toastError } from '@/components/ui'
import { useT } from '@/i18n'
import { useRest } from '@/lib/hooks'
import { hermes, rest } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { radius, space, useTheme } from '@/theme'

const TEMPLATE = `---
name: my-skill
description: One line on when to use this skill.
---

# My skill

Steps the agent should follow…
`

export default function SkillDetail() {
  const t = useT()
  const { c } = useTheme()
  const { name } = useLocalSearchParams<{ name: string }>()
  const isNew = name === '_new'
  const q = useRest<{ name: string; content: string; path: string }>(['skill', name], '/api/skills/content', { name }, { enabled: !isNew })
  const [editing, setEditing] = useState(isNew)
  const [content, setContent] = useState(isNew ? TEMPLATE : '')
  const [newName, setNewName] = useState('')
  const [category, setCategory] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (q.data?.content != null) setContent(q.data.content)
  }, [q.data?.content])

  async function save() {
    setSaving(true)
    try {
      const profile = hermes().profile ?? undefined
      const res = isNew
        ? await rest().post('/api/skills', { name: newName.trim(), content, category: category.trim() || undefined, profile })
        : await rest().put('/api/skills/content', { name, content, profile })
      const r = res as { success?: boolean; error?: string; message?: string }
      if (r.success === false) throw new Error(r.error || r.message || t('Save failed'))
      toast(isNew ? t('Skill created') : t('Saved'), 'success')
      await queryClient.invalidateQueries({ queryKey: ['skills'] })
      if (isNew) router.replace({ pathname: '/skills/[name]', params: { name: newName.trim() } })
      else {
        setEditing(false)
        void q.refetch()
      }
    } catch (e) {
      toastError(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: isNew ? t('New skill') : name,
          headerRight: () =>
            isNew ? null : (
              <IconButton icon={editing ? Eye : Pencil} label={editing ? t('Preview') : t('Edit')} onPress={() => setEditing(!editing)} />
            ),
        }}
      />
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
      {isNew ? (
        <>
          <TextField
            label={t('Name')}
            value={newName}
            onChangeText={setNewName}
            placeholder="my-skill"
            autoCapitalize="none"
            mono
            helper={t('Lowercase, dashes allowed.')}
          />
          <TextField
            label={t('Category (optional)')}
            value={category}
            onChangeText={setCategory}
            placeholder="productivity"
            autoCapitalize="none"
          />
        </>
      ) : q.data?.path ? (
        <Text variant="caption" tone="faint" mono selectable>
          {q.data.path}
        </Text>
      ) : null}
      {editing ? (
        <>
          <TextField label="SKILL.md" value={content} onChangeText={setContent} multiline minLines={18} mono autoCapitalize="none" />
          <Button
            label={isNew ? t('Create skill') : t('Save')}
            icon={Save}
            onPress={save}
            loading={saving}
            disabled={isNew && !newName.trim()}
          />
        </>
      ) : content ? (
        <View style={{ backgroundColor: c.surface, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: c.border }}>
          <Markdown text={content.replace(/^---[\s\S]*?---\n/, (m) => '```yaml\n' + m.replace(/^---\n|---\n$/g, '') + '```\n')} />
        </View>
      ) : null}
    </Screen>
  )
}
