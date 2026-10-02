import { router, Stack, useLocalSearchParams } from 'expo-router'
import { Cpu, Save } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { View } from 'react-native'

import type { CronJob } from '@/components/cron/types'
import { ModelChooser } from '@/components/ModelChooser'
import { Button, Chip, ErrorState, Loading, Row, Screen, Section, Text, TextField, toast, toastError, ToggleRow } from '@/components/ui'
import { useT } from '@/i18n'
import { useRest } from '@/lib/hooks'
import { rest } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { space } from '@/theme'

const PRESETS = ['every 30m', 'every 1h', 'every 6h', '0 9 * * *', '0 9 * * 1-5', '0 18 * * 5', '0 8 1 * *']

export default function CronEdit() {
  const t = useT()
  const { id } = useLocalSearchParams<{ id?: string }>()
  const editing = !!id
  const job = useRest<CronJob>(['cron', 'job', id], `/api/cron/jobs/${encodeURIComponent(id ?? '')}`, undefined, { enabled: editing })
  const targets = useRest<{ targets: { id: string; name: string }[] }>(['cron', 'targets'], '/api/cron/delivery-targets')
  const skills = useRest<{ name: string; enabled: boolean }[]>(['skills'], '/api/skills')

  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [schedule, setSchedule] = useState('every 1h')
  const [deliver, setDeliver] = useState('local')
  const [chosenSkills, setChosenSkills] = useState<string[]>([])
  const [model, setModel] = useState<{ provider: string; model: string } | null>(null)
  const [workdir, setWorkdir] = useState('')
  const [noAgent, setNoAgent] = useState(false)
  const [script, setScript] = useState('')
  const [choosing, setChoosing] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const j = job.data
    if (!j) return
    setName(j.name ?? '')
    setPrompt(j.prompt ?? '')
    setSchedule(j.schedule?.expr ?? j.schedule?.display ?? j.schedule_display ?? '')
    setDeliver(j.deliver ?? 'local')
    setChosenSkills(j.skills ?? [])
    setModel(j.model ? { provider: j.provider ?? '', model: j.model } : null)
    setWorkdir(j.workdir ?? '')
    setNoAgent(!!j.no_agent)
    setScript(j.script ?? '')
  }, [job.data])

  async function save() {
    setSaving(true)
    const body = {
      name: name.trim(),
      prompt: prompt.trim(),
      schedule: schedule.trim(),
      deliver,
      skills: chosenSkills,
      model: model?.model || null,
      provider: model?.provider || null,
      workdir: workdir.trim() || null,
      no_agent: noAgent,
      script: script.trim() || null,
    }
    try {
      if (editing) await rest().put(`/api/cron/jobs/${encodeURIComponent(id!)}`, { updates: body })
      else await rest().post('/api/cron/jobs', body)
      toast(editing ? t('Job updated') : t('Job created'), 'success')
      await queryClient.invalidateQueries({ queryKey: ['cron'] })
      router.back()
    } catch (e) {
      toastError(e)
    } finally {
      setSaving(false)
    }
  }

  const valid = schedule.trim() && (noAgent ? script.trim() : prompt.trim())
  return (
    <Screen>
      <Stack.Screen options={{ title: editing ? t('Edit job') : t('New job') }} />
      {job.isLoading ? <Loading /> : null}
      {job.error ? <ErrorState error={job.error} /> : null}
      <TextField label={t('Name')} value={name} onChangeText={setName} placeholder={t('Morning digest')} />
      {!noAgent ? (
        <TextField
          label={t('What should Hermes do?')}
          value={prompt}
          onChangeText={setPrompt}
          multiline
          minLines={4}
          placeholder={t('Summarise the top Hacker News stories about AI')}
        />
      ) : (
        <TextField
          label={t('Script (runs without the agent)')}
          value={script}
          onChangeText={setScript}
          multiline
          minLines={4}
          mono
          autoCapitalize="none"
        />
      )}
      <View style={{ gap: space.sm }}>
        <TextField
          label={t('Schedule')}
          value={schedule}
          onChangeText={setSchedule}
          autoCapitalize="none"
          mono
          helper={t('Plain language ("every 2h", "tomorrow at 9am") or cron ("0 9 * * 1-5").')}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
          {PRESETS.map((p) => (
            <Chip key={p} label={p} selected={schedule === p} onPress={() => setSchedule(p)} />
          ))}
        </View>
      </View>
      <View style={{ gap: space.sm }}>
        <Text variant="small" weight="medium" tone="muted">
          {t('Deliver results to')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
          {(targets.data?.targets ?? [{ id: 'local', name: 'Local' }]).map((tg) => (
            <Chip key={tg.id} label={tg.name} selected={deliver === tg.id} onPress={() => setDeliver(tg.id)} />
          ))}
        </View>
      </View>
      <Section title={t('Options')}>
        <Row icon={Cpu} title={t('Model')} value={model?.model || t('default')} onPress={() => setChoosing(true)} />
        <ToggleRow
          title={t('Script only')}
          subtitle={t('Run a shell script on schedule without calling the model')}
          value={noAgent}
          onChange={setNoAgent}
          last
        />
      </Section>
      <TextField
        label={t('Working directory (optional)')}
        value={workdir}
        onChangeText={setWorkdir}
        autoCapitalize="none"
        mono
        placeholder="/home/me/project"
      />
      {!noAgent ? (
        <View style={{ gap: space.sm }}>
          <Text variant="small" weight="medium" tone="muted">
            {t('Skills to load ({n})', { n: chosenSkills.length })}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
            {(skills.data ?? [])
              .filter((s) => s.enabled)
              .slice(0, 80)
              .map((s) => (
                <Chip
                  key={s.name}
                  label={s.name}
                  selected={chosenSkills.includes(s.name)}
                  onPress={() => setChosenSkills((cur) => (cur.includes(s.name) ? cur.filter((x) => x !== s.name) : [...cur, s.name]))}
                />
              ))}
          </View>
        </View>
      ) : null}
      <Button label={editing ? t('Save changes') : t('Create job')} icon={Save} onPress={save} loading={saving} disabled={!valid} />
      <ModelChooser
        visible={choosing}
        title={t('Model for this job')}
        allowAuto
        onClose={() => setChoosing(false)}
        onPick={(provider, m) => setModel(provider === 'auto' ? null : { provider, model: m })}
      />
    </Screen>
  )
}
