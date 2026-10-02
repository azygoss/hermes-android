import * as WebBrowser from 'expo-web-browser'
import { Link2 } from '@/components/icons'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { Badge, Button, Text, TextField, toastError } from '@/components/ui'
import { useT } from '@/i18n'
import { answerConnection, type PendingConnection } from '@/store/chat'
import { radius, space, useTheme } from '@/theme'

/** The agent asks to connect/install something (connector, MCP server, plugin, skill) mid-turn. */
export function ConnectionCard({ pc }: { pc: PendingConnection }) {
  const t = useT()
  const { c } = useTheme()
  const [env, setEnv] = useState<Record<string, Record<string, string>>>({})
  const [busy, setBusy] = useState(false)
  const targets = pc.op.targets
  const open = targets.filter((x) => x.state === 'pending' || x.state === 'initiated' || x.state === 'not_connected')

  const respond = async (status: 'approved' | 'skipped', name?: string, settle = false) => {
    setBusy(true)
    try {
      // "Continue" settles the card without answering the remaining rows.
      const rows = (settle ? [] : name ? targets.filter((x) => x.name === name) : open).map((x) => ({
        name: x.name,
        status,
        ...(env[x.name] ? { env: env[x.name] } : {}),
      }))
      await answerConnection(pc.op.op_id, rows, settle)
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={[styles.card, { backgroundColor: c.elevated, borderColor: c.info }]} accessibilityRole="alert">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Link2 size={18} color={c.info} />
        <Text weight="semibold" style={{ flex: 1 }}>
          {t('Hermes wants to connect {n} item(s)', { n: targets.length })}
        </Text>
      </View>
      {targets.map((x) => (
        <View
          key={x.name}
          style={{ gap: space.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingTop: space.sm }}
        >
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <Text weight="medium" style={{ flex: 1 }}>
              {x.display || x.name}
            </Text>
            <Badge label={`${x.kind} · ${x.action}`} />
            <Badge
              label={x.state}
              tone={x.state === 'connected' ? 'success' : x.state === 'failed' || x.state === 'expired' ? 'danger' : 'info'}
            />
          </View>
          {x.description || x.instructions || x.detail ? (
            <Text variant="small" tone="muted">
              {x.instructions || x.description || x.detail}
            </Text>
          ) : null}
          {(x.required_env ?? []).map((f) => (
            <TextField
              key={f.name}
              label={`${f.prompt || f.name}${f.required ? ' *' : ''}`}
              secret={f.secret}
              value={env[x.name]?.[f.name] ?? ''}
              placeholder={f.default || undefined}
              onChangeText={(v) => setEnv((cur) => ({ ...cur, [x.name]: { ...(cur[x.name] ?? {}), [f.name]: v } }))}
              autoCapitalize="none"
            />
          ))}
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            {x.connect_url ? (
              <Button size="sm" label={t('Open sign-in')} onPress={() => WebBrowser.openBrowserAsync(x.connect_url!)} />
            ) : null}
            {x.state !== 'connected' ? (
              <>
                <Button size="sm" variant="secondary" label={t('Approve')} loading={busy} onPress={() => respond('approved', x.name)} />
                <Button size="sm" variant="ghost" label={t('Skip')} onPress={() => respond('skipped', x.name)} />
              </>
            ) : null}
          </View>
        </View>
      ))}
      <Button label={t('Continue')} variant="secondary" loading={busy} onPress={() => respond('skipped', undefined, true)} />
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.md },
})
