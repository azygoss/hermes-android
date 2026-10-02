import { router, Stack } from 'expo-router'
import {
  Archive,
  ArchiveRestore,
  Check,
  Folder,
  FolderKanban,
  FolderPlus,
  MessageSquare,
  Pencil,
  Plus,
  Star,
  Trash2,
} from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import {
  Badge,
  Button,
  confirm,
  EmptyState,
  ErrorState,
  IconButton,
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
} from '@/components/ui'
import { useT } from '@/i18n'
import { relativeTime } from '@/lib/format'
import type { ProjectInfo } from '@/lib/gateway/contract.generated'
import { useRpc } from '@/lib/hooks'
import { hermes, rpc, useProfile } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { newChat } from '@/store/chat'
import { radius, space, useTheme } from '@/theme'

export default function ProjectsScreen() {
  const t = useT()
  const { c } = useTheme()
  const profile = useProfile()
  const q = useRpc(['projects', profile], 'projects.list', { profile })
  const [selected, setSelected] = useState<ProjectInfo | null>(null)
  const [creating, setCreating] = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['projects'] })
  const projects = q.data?.projects ?? []
  const active = q.data?.active_id

  return (
    <Screen refreshing={q.isRefetching} onRefresh={refresh}>
      <Stack.Screen
        options={{
          title: t('Projects'),
          headerRight: () => <IconButton icon={Plus} label={t('New project')} onPress={() => setCreating(true)} />,
        }}
      />
      <Text tone="muted" variant="small">
        {t('A project groups folders and repos on the backend. New chats in the active project start in its primary folder.')}
      </Text>
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
      {projects.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          onPress={() => setSelected(p)}
          style={[
            styles.card,
            { backgroundColor: c.surface, borderColor: p.id === active ? c.accent : c.border, opacity: p.archived ? 0.6 : 1 },
          ]}
        >
          <View style={[styles.icon, { backgroundColor: p.color ?? c.accentSoft }]}>
            <FolderKanban size={18} color={c.text} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center' }}>
              <Text weight="semibold">{p.name}</Text>
              {p.id === active ? <Badge label={t('active')} tone="accent" /> : null}
              {p.archived ? <Badge label={t('archived')} /> : null}
            </View>
            <Text variant="caption" tone="muted" mono numberOfLines={1}>
              {p.primary_path ?? t('{n} folders', { n: p.folders?.length ?? 0 })}
            </Text>
          </View>
        </Pressable>
      ))}
      {!q.isLoading && !projects.length ? (
        <EmptyState
          icon={FolderKanban}
          title={t('No projects yet')}
          action={<Button label={t('Create a project')} onPress={() => setCreating(true)} />}
        />
      ) : null}
      <ProjectSheet project={selected} active={selected?.id === active} onClose={() => setSelected(null)} onChanged={refresh} />
      <CreateProject visible={creating} onClose={() => setCreating(false)} onCreated={refresh} />
    </Screen>
  )
}

function ProjectSheet({
  project,
  active,
  onClose,
  onChanged,
}: {
  project: ProjectInfo | null
  active: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const t = useT()
  const profile = useProfile()
  const sessions = useRpc(
    ['projects', 'sessions', project?.id],
    'projects.project_sessions',
    { project_id: project?.id ?? '', session_limit: 20, profile },
    { enabled: !!project },
  )
  const id = project?.id ?? ''
  const act = (fn: () => Promise<unknown>, done?: string) => async () => {
    try {
      await fn()
      if (done) toast(done, 'success')
      onChanged()
    } catch (e) {
      toastError(e)
    }
  }
  const recent = sessions.data?.project?.previewSessions ?? []

  return (
    <Sheet visible={!!project} onClose={onClose} title={project?.name}>
      {project?.description ? <Text tone="muted">{project.description}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {!active ? (
          <Button
            size="sm"
            icon={Check}
            label={t('Make active')}
            onPress={act(() => rpc().request('projects.set_active', { id, profile }), t('Active project set'))}
          />
        ) : (
          <Button
            size="sm"
            variant="secondary"
            label={t('Deactivate')}
            onPress={act(() => rpc().request('projects.set_active', { id: null, profile }))}
          />
        )}
        <Button
          size="sm"
          variant="secondary"
          icon={Pencil}
          label={t('Edit')}
          onPress={async () => {
            const name = await prompt(t('Project name'), { initial: project?.name ?? '' })
            if (!name) return
            const description = await prompt(t('Description'), { initial: project?.description ?? '', multiline: true })
            await act(
              () => rpc().request('projects.update', { id, name, description: description ?? project?.description ?? null, profile }),
              t('Saved'),
            )()
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          icon={MessageSquare}
          label={t('New chat here')}
          onPress={async () => {
            onClose()
            try {
              await newChat({ cwd: project?.primary_path ?? null })
              router.navigate('/chat')
            } catch (e) {
              toastError(e)
            }
          }}
        />
      </View>
      <Section title={t('Folders')}>
        {(project?.folders ?? []).map((f, i, all) => (
          <Row
            key={f.path}
            icon={f.is_primary ? Star : Folder}
            title={f.label || f.path.split('/').pop() || f.path}
            subtitle={f.path}
            mono
            last={i === all.length - 1}
            onLongPress={async () => {
              const choice = await confirm(t('Folder: {path}', { path: f.path }), t('Make it primary, or remove it from the project?'), {
                confirmLabel: t('Make primary'),
              })
              if (choice) await act(() => rpc().request('projects.set_primary', { id, path: f.path, profile }), t('Primary folder set'))()
              else if (
                await confirm(t('Remove this folder from the project?'), undefined, { destructive: true, confirmLabel: t('Remove') })
              )
                await act(() => rpc().request('projects.remove_folder', { id, path: f.path, profile }), t('Removed'))()
            }}
          />
        ))}
        <Row
          icon={FolderPlus}
          title={t('Add a folder')}
          onPress={async () => {
            const path = await prompt(t('Folder path on the backend'), { placeholder: '/home/me/code/app' })
            if (path) await act(() => rpc().request('projects.add_folder', { id, path, profile }), t('Folder added'))()
          }}
          last
        />
      </Section>
      {recent.length ? (
        <Section title={t('Recent chats')}>
          {recent.map((s, i) => (
            <Row
              key={s.id}
              icon={MessageSquare}
              title={s.title || s.preview || s.id}
              subtitle={relativeTime(s.last_active ?? s.started_at)}
              onPress={() => (onClose(), router.navigate({ pathname: '/chat', params: { stored: s.id } }))}
              last={i === recent.length - 1}
            />
          ))}
        </Section>
      ) : null}
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button
          size="sm"
          variant="secondary"
          icon={project?.archived ? ArchiveRestore : Archive}
          label={project?.archived ? t('Restore') : t('Archive')}
          onPress={act(() => rpc().request('projects.archive', { id, restore: !!project?.archived, profile }))}
        />
        <Button
          size="sm"
          variant="dangerGhost"
          icon={Trash2}
          label={t('Delete')}
          onPress={async () => {
            if (
              !(await confirm(t('Delete {name}?', { name: project?.name ?? '' }), t('Folders on disk are not touched.'), {
                destructive: true,
                confirmLabel: t('Delete'),
              }))
            )
              return
            await act(() => rpc().request('projects.delete', { id, profile }), t('Deleted'))()
            onClose()
          }}
        />
      </View>
    </Sheet>
  )
}

function CreateProject({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const t = useT()
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    try {
      await rpc().request('projects.create', {
        name: name.trim(),
        folders: path.trim() ? [path.trim()] : [],
        primary_path: path.trim() || null,
        description: description.trim() || null,
        use: true,
        profile: hermes().profile,
      })
      toast(t('Project created'), 'success')
      onCreated()
      onClose()
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
      title={t('New project')}
      footer={<Button label={t('Create')} onPress={create} loading={busy} disabled={!name.trim()} />}
    >
      <TextField label={t('Name')} value={name} onChangeText={setName} />
      <TextField
        label={t('Primary folder on the backend')}
        value={path}
        onChangeText={setPath}
        autoCapitalize="none"
        mono
        placeholder="/home/me/code/app"
      />
      <TextField label={t('Description')} value={description} onChangeText={setDescription} multiline minLines={2} />
    </Sheet>
  )
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderRadius: radius.lg, padding: space.md },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
})
