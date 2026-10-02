import { Stack } from 'expo-router'
import { CreditCard, Home, KeyRound, Lock, Plus, ShieldCheck, Trash2, Unlock } from '@/components/icons'
import { useState } from 'react'
import { View } from 'react-native'

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
  Segmented,
  Sheet,
  Text,
  TextField,
  toast,
  toastError,
} from '@/components/ui'
import { useT } from '@/i18n'
import type { VaultKind } from '@/lib/gateway/contract.generated'
import { useRpc } from '@/lib/hooks'
import { hermes, rpc, useProfile } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { space } from '@/theme'

export default function VaultScreen() {
  const t = useT()
  const profile = useProfile()
  const sources = useRpc(['vault', 'sources', profile], 'vault.sources', { profile })
  const items = useRpc(['vault', 'items', profile], 'vault.list', { profile })
  const [adding, setAdding] = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['vault'] })
  const act = (fn: () => Promise<unknown>, done?: string) => async () => {
    try {
      await fn()
      if (done) toast(done, 'success')
      await refresh()
    } catch (e) {
      toastError(e)
    }
  }

  return (
    <Screen refreshing={items.isRefetching} onRefresh={refresh}>
      <Stack.Screen
        options={{
          title: t('Credential vault'),
          headerRight: () => <IconButton icon={Plus} label={t('Add an item')} onPress={() => setAdding(true)} />,
        }}
      />
      <Text tone="muted" variant="small">
        {t('The browser tools fill logins, cards and addresses from here without the model ever seeing the secret.')}
      </Text>
      <Section title={t('Sources')}>
        {(sources.data?.sources ?? []).map((s, i, all) => (
          <Row
            key={s.name}
            icon={s.unlocked ? Unlock : Lock}
            title={s.display_name}
            subtitle={
              !s.installed
                ? t('Not installed on the backend')
                : s.needs_unlock
                  ? s.unlocked
                    ? t('Unlocked for this session')
                    : t('Locked')
                  : t('Always available')
            }
            right={
              <View style={{ flexDirection: 'row', gap: space.xs }}>
                {s.enabled && s.needs_unlock && s.installed ? (
                  s.unlocked ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      label={t('Lock')}
                      onPress={act(() => rpc().request('vault.lock', { name: s.name, profile }))}
                    />
                  ) : (
                    <Button
                      size="sm"
                      label={t('Unlock')}
                      onPress={async () => {
                        const password = await prompt(t('Master password for {name}', { name: s.display_name }), { secret: true })
                        if (password) await act(() => rpc().request('vault.unlock', { name: s.name, password, profile }), t('Unlocked'))()
                      }}
                    />
                  )
                ) : null}
                {s.name !== 'local' ? (
                  <Button
                    size="sm"
                    variant={s.enabled ? 'ghost' : 'secondary'}
                    label={s.enabled ? t('Disable') : t('Enable')}
                    disabled={!s.installed}
                    onPress={act(() => rpc().request('vault.source.set', { name: s.name, enabled: !s.enabled, profile }))}
                  />
                ) : (
                  <Badge label={t('on')} tone="success" />
                )}
              </View>
            }
            last={i === all.length - 1}
          />
        ))}
        {sources.isLoading ? <Loading /> : null}
      </Section>
      {items.error ? <ErrorState error={items.error} onRetry={() => items.refetch()} /> : null}
      <Section title={t('Items')}>
        {(items.data?.items ?? []).map((it, i, all) => (
          <Row
            key={`${it.backend}-${it.id}`}
            icon={it.kind === 'payment' ? CreditCard : it.kind === 'address' ? Home : KeyRound}
            title={it.label}
            subtitle={[it.origin, it.identifier, it.backend !== 'local' ? it.backend : null].filter(Boolean).join(' · ')}
            right={
              it.backend === 'local' ? (
                <IconButton
                  icon={Trash2}
                  label={t('Remove {name}', { name: it.label })}
                  size={18}
                  onPress={async () => {
                    if (await confirm(t('Remove {name}?', { name: it.label }), undefined, { destructive: true, confirmLabel: t('Remove') }))
                      await act(() => rpc().request('vault.remove', { id: it.id, profile }), t('Removed'))()
                  }}
                />
              ) : undefined
            }
            last={i === all.length - 1}
          />
        ))}
        {!items.isLoading && !items.data?.items?.length ? <EmptyState icon={ShieldCheck} title={t('The vault is empty')} /> : null}
      </Section>
      <AddItem visible={adding} onClose={() => setAdding(false)} onAdded={refresh} />
    </Screen>
  )
}

function AddItem({ visible, onClose, onAdded }: { visible: boolean; onClose: () => void; onAdded: () => void }) {
  const t = useT()
  const [kind, setKind] = useState<VaultKind>('login')
  const [label, setLabel] = useState('')
  const [origin, setOrigin] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  // Field names follow agent/vault_store.py (PAYMENT_FIELDS / ADDRESS_FIELDS and the login shape).
  const spec: Record<VaultKind, { key: string; label: string; secret?: boolean }[]> = {
    login: [
      { key: 'identifier', label: t('Username or email') },
      { key: 'password', label: t('Password'), secret: true },
      { key: 'otp_secret', label: t('Authenticator key or otpauth:// link (optional)'), secret: true },
    ],
    payment: [
      { key: 'cardholder_name', label: t('Name on card') },
      { key: 'card_number', label: t('Card number'), secret: true },
      { key: 'exp_month', label: t('Expiry month') },
      { key: 'exp_year', label: t('Expiry year') },
      { key: 'cvc', label: 'CVC', secret: true },
      { key: 'billing_postal_code', label: t('Billing postal code') },
    ],
    address: [
      { key: 'address_line1', label: t('Address line 1') },
      { key: 'address_line2', label: t('Address line 2') },
      { key: 'city', label: t('City') },
      { key: 'state', label: t('State / region') },
      { key: 'postal_code', label: t('Postal code') },
      { key: 'country', label: t('Country') },
    ],
  }
  const identifierType = (v: string) => (v.includes('@') ? 'email' : /^\+?[\d\s-]{6,}$/.test(v) ? 'phone' : 'username')
  const add = async () => {
    setBusy(true)
    try {
      const secret: Record<string, string> = Object.fromEntries(
        Object.entries(fields).filter(([k, v]) => v && spec[kind].some((f) => f.key === k)),
      )
      if (kind === 'login' && secret.identifier) secret.identifier_type = identifierType(secret.identifier)
      await rpc().request('vault.add', { kind, label: label.trim(), origin: origin.trim() || null, secret, profile: hermes().profile })
      toast(t('Saved to the vault'), 'success')
      setFields({})
      setLabel('')
      setOrigin('')
      onAdded()
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
      title={t('Add to the vault')}
      footer={<Button label={t('Save')} onPress={add} loading={busy} disabled={!label.trim()} />}
    >
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'login', label: t('Login') },
          { value: 'payment', label: t('Card') },
          { value: 'address', label: t('Address') },
        ]}
      />
      <TextField
        label={t('Label')}
        value={label}
        onChangeText={setLabel}
        placeholder={kind === 'login' ? 'GitHub' : kind === 'payment' ? 'Visa' : t('Home')}
      />
      {kind === 'login' ? (
        <TextField
          label={t('Website')}
          value={origin}
          onChangeText={setOrigin}
          autoCapitalize="none"
          keyboardType="url"
          placeholder="https://github.com"
        />
      ) : null}
      {spec[kind].map((f) => (
        <TextField
          key={f.key}
          label={f.label}
          secret={f.secret}
          value={fields[f.key] ?? ''}
          onChangeText={(v) => setFields((cur) => ({ ...cur, [f.key]: v }))}
          autoCapitalize="none"
        />
      ))}
    </Sheet>
  )
}
