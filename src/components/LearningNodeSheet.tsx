import { useQuery } from '@tanstack/react-query'
import { Pencil, Trash2 } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { View } from 'react-native'

import { Markdown } from '@/components/chat/Markdown'
import { Button, confirm, ErrorState, Loading, Sheet, TextField, toast, toastError } from '@/components/ui'
import { useT } from '@/i18n'
import { hermes, rest } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { space } from '@/theme'

export interface LearningNode {
  id: string
  label: string
  kind: 'skill' | 'memory' | string
  timestamp?: number
  category?: string
  useCount?: number
  state?: string
  createdBy?: string
  pinned?: boolean
  memorySource?: string
}

/** View, edit or delete a memory chunk or a skill from the learning graph. */
export function LearningNodeSheet({ node, onClose }: { node: LearningNode | null; onClose: () => void }) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const detail = useQuery({
    queryKey: ['learning-node', node?.id],
    enabled: !!node,
    queryFn: () =>
      rest().get<{ ok?: boolean; content?: string; label?: string; kind?: string }>('/api/learning/node', { query: { id: node!.id } }),
  })
  useEffect(() => {
    setEditing(false)
    setContent(detail.data?.content ?? '')
  }, [detail.data?.content, node?.id])

  const save = async () => {
    setBusy(true)
    try {
      await rest().put('/api/learning/node', { id: node!.id, content, profile: hermes().profile ?? undefined })
      toast(t('Saved'), 'success')
      setEditing(false)
      await Promise.all([detail.refetch(), queryClient.invalidateQueries({ queryKey: ['learning-graph'] })])
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    const isSkill = node?.kind === 'skill'
    if (
      !(await confirm(
        isSkill ? t('Archive this skill?') : t('Forget this memory?'),
        isSkill ? t('Archived skills can be restored by the curator.') : t('Hermes will no longer remember this.'),
        { destructive: true, confirmLabel: isSkill ? t('Archive') : t('Forget') },
      ))
    )
      return
    setBusy(true)
    try {
      await rest().del('/api/learning/node', { id: node!.id, profile: hermes().profile ?? undefined })
      toast(isSkill ? t('Archived') : t('Forgotten'), 'success')
      await queryClient.invalidateQueries({ queryKey: ['learning-graph'] })
      void queryClient.invalidateQueries({ queryKey: ['skills'] })
      onClose()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      visible={!!node}
      onClose={onClose}
      title={node?.kind === 'skill' ? node.label : t('Memory')}
      footer={
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {editing ? (
            <Button label={t('Save')} onPress={save} loading={busy} style={{ flex: 1 }} />
          ) : (
            <Button label={t('Edit')} icon={Pencil} variant="secondary" onPress={() => setEditing(true)} style={{ flex: 1 }} />
          )}
          <Button label={node?.kind === 'skill' ? t('Archive') : t('Forget')} icon={Trash2} variant="dangerGhost" onPress={remove} />
        </View>
      }
    >
      {detail.isLoading ? <Loading /> : null}
      {detail.error ? <ErrorState error={detail.error} /> : null}
      {editing ? (
        <TextField value={content} onChangeText={setContent} multiline minLines={10} mono={node?.kind === 'skill'} />
      ) : detail.data?.content ? (
        <Markdown text={detail.data.content} />
      ) : null}
    </Sheet>
  )
}
