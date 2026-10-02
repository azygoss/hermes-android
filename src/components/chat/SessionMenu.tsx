import { router } from 'expo-router'
import * as Sharing from 'expo-sharing'
import {
  Archive,
  Brain,
  Cpu,
  FolderOpen,
  GitBranch,
  Gauge,
  History,
  Info,
  ListRestart,
  MessageCircleQuestion,
  PackageOpen,
  Pencil,
  Repeat,
  Rocket,
  Send,
  ShieldOff,
  Shrink,
  Target,
  Trash2,
  Undo2,
  Users,
  Zap,
} from 'lucide-react-native'
import { File, Paths } from 'expo-file-system'
import { Platform, View } from 'react-native'

import { addSystemMessage, closeRuntime, loadHistory, openStored, runSlash, useChat } from '@/store/chat'
import { confirm, prompt, Row, Section, Sheet, Text, toast, toastError, ToggleRow } from '@/components/ui'
import { useT } from '@/i18n'
import type { ChatSession } from '@/lib/chat/types'
import { rest, rpc } from '@/lib/hermes'
import { space } from '@/theme'

interface Props {
  visible: boolean
  onClose: () => void
  session: ChatSession
  onPickModel: () => void
  onPickReasoning: () => void
}

export function SessionMenu({ visible, onClose, session, onPickModel, onPickReasoning }: Props) {
  const t = useT()
  const sid = session.runtimeId
  const info = session.info ?? {}
  const run = (fn: () => Promise<unknown>) => async () => {
    onClose()
    try {
      await fn()
    } catch (e) {
      toastError(e)
    }
  }
  const go = (path: string) => () => {
    onClose()
    router.push({ pathname: path as never, params: { sid } })
  }

  const setFlag = async (key: string, value: string) => {
    const res = await rpc().request('config.set', { key, value, session_id: sid })
    if ((res as { warning?: string }).warning) toast(String((res as { warning?: string }).warning), 'warn')
    useChat.setState((st) => ({
      sessions: {
        ...st.sessions,
        [sid]: { ...st.sessions[sid], info: { ...st.sessions[sid].info, ...((res as { info?: object }).info ?? {}) } },
      },
    }))
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={session.title || t('This chat')}>
      <View style={{ marginHorizontal: -space.lg, gap: space.lg }}>
        <Section title={t('Model & behaviour')}>
          <Row icon={Cpu} title={t('Model')} value={String(info.model ?? '—')} onPress={() => (onClose(), onPickModel())} />
          <Row
            icon={Brain}
            title={t('Reasoning effort')}
            value={String(info.reasoning_effort || t('default'))}
            onPress={() => (onClose(), onPickReasoning())}
          />
          <ToggleRow
            icon={Zap}
            title={t('Fast mode')}
            subtitle={t('Priority processing where the provider supports it')}
            value={!!info.fast}
            onChange={(v) => setFlag('fast', v ? 'fast' : 'normal').catch(toastError)}
          />
          <ToggleRow
            icon={ShieldOff}
            title={t('YOLO — skip approvals')}
            subtitle={t('Dangerous commands run without asking in this chat')}
            value={!!info.yolo}
            onChange={async (v) => {
              if (
                v &&
                !(await confirm(t('Skip all approvals?'), t('The agent will run dangerous commands without asking.'), {
                  destructive: true,
                  confirmLabel: t('Enable'),
                }))
              )
                return
              setFlag('yolo', v ? '1' : '0').catch(toastError)
            }}
          />
          <Row
            icon={Rocket}
            title={t('Approval mode')}
            value={String(info.approval_mode ?? '—')}
            onPress={run(async () => {
              const order = ['manual', 'smart', 'off']
              const next = order[(order.indexOf(String(info.approval_mode)) + 1) % order.length]
              await setFlag('approval_mode', next)
              toast(t('Approval mode: {mode}', { mode: next }), 'info')
            })}
          />
          <Row
            icon={FolderOpen}
            title={t('Working directory')}
            subtitle={String(info.cwd ?? '')}
            numberOfLines={2}
            onPress={run(async () => {
              const cwd = await prompt(t('Working directory'), { initial: String(info.cwd ?? ''), placeholder: '/home/me/project' })
              if (!cwd) return
              await rpc().request('session.cwd.set', { session_id: sid, cwd } as never)
              toast(t('Working directory changed'), 'success')
            })}
            last
          />
        </Section>

        <Section title={t('Conversation')}>
          <Row
            icon={Pencil}
            title={t('Rename')}
            onPress={run(async () => {
              const title = await prompt(t('Rename chat'), { initial: session.title ?? '' })
              if (!title) return
              await rpc().request('session.title', { session_id: sid, title } as never)
              useChat.setState((st) => ({ sessions: { ...st.sessions, [sid]: { ...st.sessions[sid], title } } }))
            })}
          />
          <Row icon={Repeat} title={t('Retry last message')} onPress={run(() => runSlash(sid, '/retry'))} />
          <Row
            icon={Undo2}
            title={t('Undo last turn')}
            onPress={run(async () => {
              const res = await rpc().request('session.undo', { session_id: sid } as never)
              toast(t('Removed {n} messages', { n: (res as { removed?: number }).removed ?? 0 }), 'success')
              await loadHistory(sid)
            })}
          />
          <Row
            icon={GitBranch}
            title={t('Branch into a new chat')}
            subtitle={t('Fork with the history so far')}
            onPress={run(async () => {
              const res = await rpc().request('session.branch', { session_id: sid } as never)
              const stored = (res as { stored_session_id?: string }).stored_session_id
              if (stored) await openStored(stored)
              toast(t('Branched'), 'success')
            })}
          />
          <Row
            icon={Shrink}
            title={t('Compress context')}
            subtitle={t('Summarise older turns to free the context window')}
            onPress={run(async () => {
              const focus = await prompt(t('Compress context'), {
                message: t('Optional: what to keep in focus'),
                placeholder: t('e.g. the API design'),
              })
              if (focus === null) return
              addSystemMessage(sid, t('Compressing…'), 'info')
              const res = await rpc().request('session.compress', { session_id: sid, ...(focus ? { focus } : {}) } as never, {
                timeoutMs: 300_000,
              })
              const r = res as { before_tokens?: number; after_tokens?: number; message?: string }
              addSystemMessage(
                sid,
                r.message ?? t('Compressed {before} → {after} tokens', { before: r.before_tokens ?? '?', after: r.after_tokens ?? '?' }),
                'success',
              )
            })}
          />
          <Row
            icon={MessageCircleQuestion}
            title={t('Side question (/btw)')}
            subtitle={t('Ask without disturbing the main task')}
            onPress={run(async () => {
              const q = await prompt(t('Side question'), { multiline: true })
              if (!q) return
              await rpc().request('prompt.btw', { session_id: sid, text: q } as never)
              addSystemMessage(sid, t('Side question sent: {q}', { q }), 'info', 'btw')
            })}
          />
          <Row
            icon={Send}
            title={t('Background task (/bg)')}
            subtitle={t('Run a separate agent; the answer lands here')}
            onPress={run(async () => {
              const q = await prompt(t('Background task'), { multiline: true })
              if (!q) return
              await rpc().request('prompt.background', { session_id: sid, text: q } as never)
              addSystemMessage(sid, t('Background task started: {q}', { q }), 'info', 'background')
            })}
            last
          />
        </Section>

        <Section title={t('Inspect')}>
          <Row icon={Gauge} title={t('Usage & context')} onPress={go('/session/usage')} />
          <Row icon={Users} title={t('Subagents & processes')} onPress={go('/session/agents')} />
          <Row icon={Target} title={t('Goal, loop & heartbeat')} onPress={go('/session/goals')} />
          <Row icon={History} title={t('Checkpoints & rollback')} onPress={go('/session/rollback')} />
          <Row
            icon={Info}
            title={t('Status')}
            onPress={run(async () => {
              const res = await rpc().request('session.status', { session_id: sid } as never)
              addSystemMessage(sid, '```\n' + String((res as { output?: string }).output ?? '') + '\n```', 'info', 'status')
            })}
            last
          />
        </Section>

        <Section title={t('Share & manage')}>
          <Row
            icon={PackageOpen}
            title={t('Export transcript')}
            onPress={run(async () => {
              if (!session.storedId) return
              const data = await rest().get(`/api/sessions/${encodeURIComponent(session.storedId)}/export`)
              const body = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
              if (Platform.OS === 'web') {
                toast(t('Export is available in the Android app.'), 'info')
                return
              }
              const file = new File(Paths.cache, `hermes-${session.storedId}.json`)
              file.write(body)
              await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: t('Export transcript') })
            })}
          />
          <Row
            icon={ListRestart}
            title={t('Save on the backend (/save)')}
            onPress={run(async () => {
              const res = await rpc().request('session.save', { session_id: sid } as never)
              toast(t('Saved to {file}', { file: String((res as { file?: string }).file ?? '') }), 'success')
            })}
          />
          <Row
            icon={Send}
            title={t('Hand off to a messaging app')}
            subtitle={t('Continue this chat on Telegram, Discord, …')}
            onPress={run(async () => {
              const platform = await prompt(t('Hand off to'), { placeholder: 'telegram' })
              if (!platform) return
              await rpc().request('handoff.request', { session_id: sid, platform } as never)
              toast(t('Handoff queued'), 'success')
            })}
          />
          <Row
            icon={Archive}
            title={t('Archive')}
            onPress={run(async () => {
              if (!session.storedId) return
              await rest().patch(`/api/sessions/${encodeURIComponent(session.storedId)}`, { archived: true })
              await closeRuntime(sid)
              toast(t('Archived'), 'success')
            })}
          />
          <Row
            icon={Trash2}
            danger
            title={t('Delete chat')}
            onPress={run(async () => {
              if (
                !(await confirm(t('Delete this chat?'), t('The transcript is removed from the backend.'), {
                  destructive: true,
                  confirmLabel: t('Delete'),
                }))
              )
                return
              const stored = session.storedId
              await closeRuntime(sid)
              if (stored) await rest().del(`/api/sessions/${encodeURIComponent(stored)}`)
              toast(t('Deleted'), 'success')
            })}
            last
          />
        </Section>
        <Text variant="caption" tone="faint" style={{ paddingHorizontal: space.lg }} selectable>
          {session.storedId ?? sid}
        </Text>
      </View>
    </Sheet>
  )
}
