import * as Haptics from 'expo-haptics'
import { HelpCircle, KeyRound, ShieldAlert } from '@/components/icons'
import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { Button, Chip, Text, TextField } from '@/components/ui'
import { useT } from '@/i18n'
import type { ApprovalRequestParams, ClarifyRequestParams } from '@/lib/gateway/contract.generated'
import { answerRequest, type PendingRequest } from '@/store/chat'
import { useSettings } from '@/store/settings'
import { radius, space, useTheme } from '@/theme'

function Shell({
  icon: Icon,
  tone,
  title,
  children,
}: {
  icon: typeof ShieldAlert
  tone: 'warn' | 'info' | 'accent'
  title: string
  children: React.ReactNode
}) {
  const { c } = useTheme()
  const color = tone === 'warn' ? c.warn : tone === 'info' ? c.info : c.accentText
  return (
    <View
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderStrong }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <View style={styles.head}>
        <Icon size={18} color={color} strokeWidth={1.75} />
        <Text weight="semibold" style={{ flex: 1 }}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  )
}

function Approval({ req }: { req: PendingRequest }) {
  const t = useT()
  const { c } = useTheme()
  const p = req.params as ApprovalRequestParams
  let choices = p.choices?.length
    ? p.choices
    : p.smart_denied
      ? (['once', 'deny'] as const)
      : (['once', 'session', 'always', 'deny'] as const)
  if (p.allow_permanent === false) choices = choices.filter((x) => x !== 'always')
  if (p.allow_session === false) choices = choices.filter((x) => x !== 'session')
  const labels: Record<string, string> = {
    once: t('Allow once'),
    session: t('Allow this session'),
    always: t('Always allow'),
    deny: t('Deny'),
  }
  return (
    <Shell icon={ShieldAlert} tone="warn" title={p.smart_denied ? t('Flagged as risky — approve?') : t('Approve this command?')}>
      {p.description ? (
        <Text variant="small" tone="muted">
          {p.description}
        </Text>
      ) : null}
      {p.command ? (
        <View style={[styles.cmd, { backgroundColor: c.codeBg }]}>
          <Text mono variant="small" selectable>
            {p.command}
          </Text>
        </View>
      ) : null}
      <View style={styles.wrap}>
        {choices.map((choice) => (
          <Button
            key={choice}
            label={labels[choice] ?? choice}
            size="sm"
            variant={choice === 'deny' ? 'dangerGhost' : choice === 'once' ? 'primary' : 'secondary'}
            onPress={() => {
              if (useSettings.getState().haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
              answerRequest(req.id, { choice })
            }}
          />
        ))}
      </View>
    </Shell>
  )
}

function Clarify({ req }: { req: PendingRequest }) {
  const t = useT()
  const p = req.params as ClarifyRequestParams
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [other, setOther] = useState<Record<string, string>>({})

  useEffect(() => {
    // Replayed requests carry the answers already locked.
    if (p.answers) {
      const init: Record<string, string[]> = {}
      for (const [qid, v] of Object.entries(p.answers)) if (v) init[qid] = v.startsWith('[') ? JSON.parse(v) : [v]
      setPicked(init)
    }
  }, [p.answers])

  const answerFor = (q: ClarifyRequestParams['questions'][number]) => {
    const typed = other[q.qid]?.trim()
    const chosen = picked[q.qid] ?? []
    if (q.multi_select) {
      const all = typed ? [...chosen, typed] : chosen
      return all.length ? JSON.stringify(all) : null
    }
    return typed || chosen[0] || null
  }
  const ready = p.questions.every((q) => answerFor(q) != null)

  return (
    <Shell
      icon={HelpCircle}
      tone="info"
      title={p.questions.length > 1 ? t('Hermes has {n} questions', { n: p.questions.length }) : t('Hermes has a question')}
    >
      {p.questions.map((q) => (
        <View key={q.qid} style={{ gap: space.sm }}>
          <Text weight="medium">{q.question}</Text>
          {q.choices?.length ? (
            <View style={styles.wrap}>
              {q.choices.map((choice) => {
                const on = (picked[q.qid] ?? []).includes(choice)
                return (
                  <Chip
                    key={choice}
                    label={choice}
                    selected={on}
                    onPress={() =>
                      setPicked((cur) => {
                        const list = cur[q.qid] ?? []
                        const next = q.multi_select ? (on ? list.filter((x) => x !== choice) : [...list, choice]) : on ? [] : [choice]
                        return { ...cur, [q.qid]: next }
                      })
                    }
                  />
                )
              })}
            </View>
          ) : null}
          <TextField
            placeholder={q.choices?.length ? t('Or type your own answer') : t('Your answer')}
            value={other[q.qid] ?? ''}
            onChangeText={(v) => setOther((cur) => ({ ...cur, [q.qid]: v }))}
            multiline={!q.choices?.length}
            minLines={2}
          />
        </View>
      ))}
      <View style={styles.wrap}>
        <Button
          label={t('Send answer')}
          size="sm"
          disabled={!ready}
          onPress={() => answerRequest(req.id, { answers: Object.fromEntries(p.questions.map((q) => [q.qid, answerFor(q)])) })}
        />
        <Button label={t('Skip')} size="sm" variant="ghost" onPress={() => answerRequest(req.id, {})} />
      </View>
    </Shell>
  )
}

function Secret({ req }: { req: PendingRequest }) {
  const t = useT()
  const p = req.params as Record<string, unknown>
  const [value, setValue] = useState('')
  const [user, setUser] = useState('')
  const titles: Record<string, string> = {
    sudo: t('Administrator password needed'),
    secret: t('A secret is needed: {name}', { name: String(p.env_var ?? '') }),
    'vault.code': t('Enter the one-time code'),
    'vault.unlock_prompt': t('Unlock {name}', { name: String(p.display_name ?? p.backend ?? '') }),
    'vault.save_login': t('Save a login for {site}', { site: String(p.site ?? p.origin ?? '') }),
    'display.install.sudo': t('Administrator password needed'),
  }
  const isLogin = req.method === 'vault.save_login'
  const submit = () => answerRequest(req.id, { value: isLogin ? JSON.stringify({ identifier: user, password: value }) : value })
  return (
    <Shell icon={KeyRound} tone="accent" title={titles[req.method] ?? req.method}>
      {p.prompt || p.command || p.hint ? (
        <Text variant="small" tone="muted">
          {String(p.prompt ?? p.command ?? p.hint)}
        </Text>
      ) : null}
      {isLogin ? <TextField label={t('Username or email')} value={user} onChangeText={setUser} autoCapitalize="none" /> : null}
      <TextField
        label={req.method === 'vault.code' ? t('Code') : t('Password')}
        value={value}
        onChangeText={setValue}
        secret={req.method !== 'vault.code'}
        keyboardType={req.method === 'vault.code' ? 'number-pad' : 'default'}
        onSubmitEditing={submit}
        helper={t('Sent only to your Hermes backend for this request.')}
      />
      <View style={styles.wrap}>
        <Button label={t('Submit')} size="sm" disabled={!value} onPress={submit} />
        <Button label={t('Skip')} size="sm" variant="ghost" onPress={() => answerRequest(req.id, { value: '' })} />
      </View>
    </Shell>
  )
}

export function RequestCard({ req }: { req: PendingRequest }) {
  if (req.method === 'approval') return <Approval req={req} />
  if (req.method === 'clarify') return <Clarify req={req} />
  return <Secret req={req} />
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cmd: { borderRadius: radius.sm, padding: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
})
