import * as Clipboard from 'expo-clipboard'
import { Stack } from 'expo-router'
import { Copy, Plus, Trash2, Webhook } from '@/components/icons'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import {
  Badge,
  Button,
  Card,
  Chip,
  confirm,
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
  Toggle,
  ToggleRow,
} from '@/components/ui'
import { useT } from '@/i18n'
import { useRest } from '@/lib/hooks'
import { rest } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { radius, space, useTheme } from '@/theme'

interface Route {
  name: string
  description: string
  events: string[]
  deliver: string
  deliver_only: boolean
  prompt: string
  skills: string[]
  url: string
  secret_set: boolean
  enabled: boolean
}

export default function WebhooksScreen() {
  const t = useT()
  const { c } = useTheme()
  const q = useRest<{ enabled: boolean; base_url: string; subscriptions: Route[] }>(['webhooks'], '/api/webhooks')
  const [creating, setCreating] = useState(false)
  const [secret, setSecret] = useState<{ name: string; url: string; secret: string } | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['webhooks'] })

  return (
    <Screen refreshing={q.isRefetching} onRefresh={refresh}>
      <Stack.Screen
        options={{
          title: t('Webhooks'),
          headerRight: () =>
            q.data?.enabled ? <IconButton icon={Plus} label={t('New webhook')} onPress={() => setCreating(true)} /> : null,
        }}
      />
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
      {q.data && !q.data.enabled ? (
        <Card>
          <Text weight="semibold">{t('Webhooks are off')}</Text>
          <Text tone="muted" variant="small">
            {t('Turn on the webhook listener so services like GitHub can wake Hermes with events.')}
          </Text>
          <Button
            label={t('Enable webhooks')}
            onPress={async () => {
              try {
                await rest().post('/api/webhooks/enable')
                toast(t('Webhooks enabled — restart the gateway to start listening'), 'success')
                await refresh()
              } catch (e) {
                toastError(e)
              }
            }}
            style={{ alignSelf: 'flex-start' }}
          />
        </Card>
      ) : null}
      {q.data?.enabled ? (
        <Text variant="small" tone="muted" mono selectable>
          {q.data.base_url}
        </Text>
      ) : null}
      {q.data?.enabled && !q.data.subscriptions.length ? (
        <EmptyState
          icon={Webhook}
          title={t('No webhook routes')}
          action={<Button label={t('New webhook')} onPress={() => setCreating(true)} />}
        />
      ) : null}
      {(q.data?.subscriptions ?? []).map((w) => (
        <View key={w.name} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text weight="semibold" style={{ flex: 1 }}>
              {w.name}
            </Text>
            <Toggle
              value={w.enabled}
              onValueChange={async (v) => {
                try {
                  await rest().put(`/api/webhooks/${encodeURIComponent(w.name)}/enabled`, { enabled: v })
                  await refresh()
                } catch (e) {
                  toastError(e)
                }
              }}
              accessibilityLabel={t('Enable {name}', { name: w.name })}
            />
          </View>
          {w.description ? (
            <Text variant="small" tone="muted">
              {w.description}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <Text mono variant="caption" style={{ flex: 1 }} numberOfLines={1} selectable>
              {w.url}
            </Text>
            <IconButton
              icon={Copy}
              size={16}
              label={t('Copy URL')}
              onPress={() => (Clipboard.setStringAsync(w.url), toast(t('Copied'), 'success'))}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }}>
            {w.events.map((e) => (
              <Badge key={e} label={e} />
            ))}
            <Badge label={`→ ${w.deliver}`} tone="info" />
            {w.deliver_only ? <Badge label={t('forward only')} /> : null}
          </View>
          <Button
            size="sm"
            variant="dangerGhost"
            icon={Trash2}
            label={t('Delete')}
            onPress={async () => {
              if (!(await confirm(t('Delete {name}?', { name: w.name }), undefined, { destructive: true, confirmLabel: t('Delete') })))
                return
              try {
                await rest().del(`/api/webhooks/${encodeURIComponent(w.name)}`)
                await refresh()
              } catch (e) {
                toastError(e)
              }
            }}
            style={{ alignSelf: 'flex-start' }}
          />
        </View>
      ))}
      <CreateWebhook visible={creating} onClose={() => setCreating(false)} onCreated={(r) => (setSecret(r), refresh())} />
      <Sheet visible={!!secret} onClose={() => setSecret(null)} title={t('Webhook created')}>
        <Text tone="muted">{t('Copy the signing secret now; it is not shown again.')}</Text>
        <TextField label="URL" value={secret?.url ?? ''} editable={false} mono />
        <TextField label={t('Secret')} value={secret?.secret ?? ''} editable={false} mono />
        <Button
          label={t('Copy secret')}
          icon={Copy}
          onPress={() => secret && (Clipboard.setStringAsync(secret.secret), toast(t('Copied'), 'success'))}
        />
      </Sheet>
    </Screen>
  )
}

const EVENTS = ['push', 'pull_request', 'issues', 'issue_comment', 'release', 'workflow_run', '*']

function CreateWebhook({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean
  onClose: () => void
  onCreated: (r: { name: string; url: string; secret: string }) => void
}) {
  const t = useT()
  const targets = useRest<{ targets: { id: string; name: string }[] }>(['cron', 'targets'], '/api/cron/delivery-targets')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')
  const [events, setEvents] = useState<string[]>(['push'])
  const [deliver, setDeliver] = useState('local')
  const [deliverOnly, setDeliverOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    try {
      const res = await rest().post<Route & { secret: string }>('/api/webhooks', {
        name: name.trim(),
        description,
        events,
        prompt,
        deliver,
        deliver_only: deliverOnly,
      })
      onCreated({ name: res.name, url: res.url, secret: res.secret })
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
      title={t('New webhook')}
      footer={<Button label={t('Create')} onPress={create} loading={busy} disabled={!name.trim()} />}
    >
      <TextField label={t('Name')} value={name} onChangeText={setName} autoCapitalize="none" placeholder="github-pushes" />
      <TextField label={t('Description')} value={description} onChangeText={setDescription} />
      <TextField
        label={t('Prompt for the agent')}
        value={prompt}
        onChangeText={setPrompt}
        multiline
        minLines={3}
        placeholder={t('Review the pushed commits and flag anything risky.')}
      />
      <Text variant="small" weight="medium" tone="muted">
        {t('Events')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        {EVENTS.map((e) => (
          <Chip
            key={e}
            label={e}
            selected={events.includes(e)}
            onPress={() => setEvents((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]))}
          />
        ))}
      </View>
      <Text variant="small" weight="medium" tone="muted">
        {t('Deliver to')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        {(targets.data?.targets ?? [{ id: 'local', name: 'Local' }]).map((tg) => (
          <Chip key={tg.id} label={tg.name} selected={deliver === tg.id} onPress={() => setDeliver(tg.id)} />
        ))}
      </View>
      <View style={{ marginHorizontal: -space.lg }}>
        <ToggleRow
          title={t('Forward only')}
          subtitle={t('Deliver the event without running the agent')}
          value={deliverOnly}
          onChange={setDeliverOnly}
          last
        />
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.md, gap: space.sm },
})
