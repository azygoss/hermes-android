import * as DocumentPicker from 'expo-document-picker'
import { File, Paths } from 'expo-file-system'
import { Image } from 'expo-image'
import { Stack, useLocalSearchParams, router } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { ArrowUp, File as FileIcon, FileImage, FileText, Folder, FolderPlus, Home, Share2, Trash2, Upload } from 'lucide-react-native'
import { useState } from 'react'
import { Platform, ScrollView, View } from 'react-native'

import { Markdown } from '@/components/chat/Markdown'
import {
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
  toast,
  toastError,
} from '@/components/ui'
import { useT } from '@/i18n'
import { bytes, relativeTime } from '@/lib/format'
import { useRest } from '@/lib/hooks'
import { hermes, rest } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { fileToBase64 } from '@/lib/voice'
import { setPrefill, useChat } from '@/store/chat'
import { radius, space, useTheme } from '@/theme'

interface Entry {
  name: string
  path: string
  is_directory: boolean
  size: number | null
  mtime: number | null
  mime_type: string | null
}
interface Listing {
  path: string
  parent: string | null
  entries: Entry[]
  root?: string
  locked_root?: boolean
}

function decodeBase64Utf8(b64: string) {
  const bin = atob(b64)
  const bytesArr = Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
  return new TextDecoder().decode(bytesArr)
}

export default function FilesScreen() {
  const t = useT()
  const { c } = useTheme()
  const params = useLocalSearchParams<{ path?: string }>()
  const [path, setPath] = useState<string | undefined>(params.path)
  const [showHidden, setShowHidden] = useState(false)
  const [preview, setPreview] = useState<Entry | null>(null)
  const q = useRest<Listing>(['files', path ?? ''], '/api/files', { path: path ?? '' })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['files'] })
  const listing = q.data
  const entries = (listing?.entries ?? [])
    .filter((e) => showHidden || !e.name.startsWith('.'))
    .sort((a, b) => Number(b.is_directory) - Number(a.is_directory) || a.name.localeCompare(b.name))

  async function upload() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true })
      if (res.canceled || !listing) return
      for (const asset of res.assets) {
        const b64 = await fileToBase64(asset.uri)
        await rest().post(
          '/api/files/upload',
          {
            path: `${listing.path.replace(/\/$/, '')}/${asset.name}`,
            data_url: `data:${asset.mimeType ?? 'application/octet-stream'};base64,${b64}`,
            overwrite: true,
          },
          { timeoutMs: 300_000 },
        )
      }
      toast(t('Uploaded {n} files', { n: res.assets.length }), 'success')
      await refresh()
    } catch (e) {
      toastError(e)
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: t('Files'),
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <IconButton icon={Upload} label={t('Upload files here')} onPress={upload} />
              <IconButton
                icon={FolderPlus}
                label={t('New folder')}
                onPress={async () => {
                  const name = await prompt(t('New folder'), { placeholder: 'notes' })
                  if (!name || !listing) return
                  try {
                    await rest().post('/api/files/mkdir', { path: `${listing.path.replace(/\/$/, '')}/${name}` })
                    await refresh()
                  } catch (e) {
                    toastError(e)
                  }
                }}
              />
            </View>
          ),
        }}
      />
      <Screen refreshing={q.isRefetching} onRefresh={refresh}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <IconButton icon={Home} label={t('Home folder')} onPress={() => setPath(undefined)} size={18} />
          <IconButton
            icon={ArrowUp}
            label={t('Parent folder')}
            disabled={!listing?.parent}
            onPress={() => listing?.parent && setPath(listing.parent)}
            size={18}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            <Text mono variant="small" tone="muted" selectable>
              {listing?.path ?? '…'}
            </Text>
          </ScrollView>
          <Button
            size="sm"
            variant="ghost"
            label={showHidden ? t('Hide dotfiles') : t('Dotfiles')}
            onPress={() => setShowHidden(!showHidden)}
          />
        </View>
        {q.isLoading ? <Loading /> : null}
        {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
        {listing && !entries.length ? <EmptyState icon={Folder} title={t('Empty folder')} /> : null}
        {entries.length ? (
          <Section>
            {entries.map((e, i) => (
              <Row
                key={e.path}
                icon={
                  e.is_directory
                    ? Folder
                    : e.mime_type?.startsWith('image/')
                      ? FileImage
                      : e.mime_type?.startsWith('text/')
                        ? FileText
                        : FileIcon
                }
                title={e.name}
                subtitle={[e.is_directory ? null : bytes(e.size), relativeTime(e.mtime)].filter(Boolean).join(' · ')}
                onPress={() => (e.is_directory ? setPath(e.path) : setPreview(e))}
                onLongPress={async () => {
                  if (
                    !(await confirm(
                      t('Delete {name}?', { name: e.name }),
                      e.is_directory ? t('The folder and everything in it is deleted.') : undefined,
                      { destructive: true, confirmLabel: t('Delete') },
                    ))
                  )
                    return
                  try {
                    await rest().del('/api/files', { path: e.path, recursive: e.is_directory })
                    await refresh()
                  } catch (err) {
                    toastError(err)
                  }
                }}
                last={i === entries.length - 1}
              />
            ))}
          </Section>
        ) : null}
      </Screen>
      <PreviewSheet entry={preview} onClose={() => setPreview(null)} onDeleted={refresh} />
    </View>
  )
}

function PreviewSheet({ entry, onClose, onDeleted }: { entry: Entry | null; onClose: () => void; onDeleted: () => void }) {
  const t = useT()
  const { c } = useTheme()
  const small = (entry?.size ?? 0) < 4 * 1024 * 1024
  const q = useRest<{ data_url: string; mime_type: string }>(
    ['file-read', entry?.path],
    '/api/files/read',
    { path: entry?.path ?? '' },
    { enabled: !!entry && small },
  )
  const mime = q.data?.mime_type ?? entry?.mime_type ?? ''
  const b64 = q.data?.data_url ? q.data.data_url.slice(q.data.data_url.indexOf(',') + 1) : ''
  const isText =
    /^text\/|json|yaml|xml|javascript|typescript|x-sh|toml/.test(mime) ||
    /\.(md|txt|py|ts|tsx|js|json|ya?ml|toml|sh|log|ini|cfg|env|rs|go|java|kt|c|h|cpp|css|html)$/i.test(entry?.name ?? '')
  let text = ''
  if (isText && b64) {
    try {
      text = decodeBase64Utf8(b64)
    } catch {
      text = ''
    }
  }

  async function share() {
    if (!entry) return
    try {
      if (Platform.OS === 'web') return toast(t('Sharing is available in the Android app.'), 'info')
      const dest = new File(Paths.cache, entry.name)
      if (dest.exists) dest.delete()
      const url = hermes().rest.url('/api/files/download', { path: entry.path })
      const file = await File.downloadFileAsync(url, dest, { headers: await hermes().authHeaders() })
      await Sharing.shareAsync(file.uri, { mimeType: mime || undefined })
    } catch (e) {
      toastError(e)
    }
  }

  return (
    <Sheet
      visible={!!entry}
      onClose={onClose}
      title={entry?.name}
      heightRatio={0.92}
      footer={
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button label={t('Download / share')} icon={Share2} onPress={share} style={{ flex: 1 }} />
          <Button
            label={t('Ask Hermes about it')}
            variant="secondary"
            onPress={() => {
              onClose()
              router.navigate('/chat')
              setTimeout(() => {
                setPrefill(useChat.getState().activeId ?? '', `@file:${entry?.path} `)
              }, 300)
            }}
            style={{ flex: 1 }}
          />
          <IconButton
            icon={Trash2}
            label={t('Delete')}
            color={c.danger}
            onPress={async () => {
              if (
                !entry ||
                !(await confirm(t('Delete {name}?', { name: entry.name }), undefined, { destructive: true, confirmLabel: t('Delete') }))
              )
                return
              try {
                await rest().del('/api/files', { path: entry.path, recursive: false })
                onDeleted()
                onClose()
              } catch (e) {
                toastError(e)
              }
            }}
          />
        </View>
      }
    >
      <Text variant="caption" tone="faint" mono selectable>
        {entry?.path} · {bytes(entry?.size)}
      </Text>
      {!small ? <Text tone="muted">{t('Too large to preview. Download it instead.')}</Text> : null}
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorState error={q.error} /> : null}
      {mime.startsWith('image/') && q.data ? (
        <Image source={{ uri: q.data.data_url }} style={{ width: '100%', aspectRatio: 1, borderRadius: radius.md }} contentFit="contain" />
      ) : null}
      {isText && text ? (
        /\.md$/i.test(entry?.name ?? '') ? (
          <Markdown text={text.slice(0, 60_000)} />
        ) : (
          <ScrollView horizontal style={{ backgroundColor: c.codeBg, borderRadius: radius.md }}>
            <Text mono variant="caption" selectable style={{ padding: space.sm }}>
              {text.slice(0, 60_000)}
            </Text>
          </ScrollView>
        )
      ) : null}
      {q.data && !isText && !mime.startsWith('image/') ? (
        <Text tone="muted">{t('No preview for {mime}.', { mime: mime || t('this file type') })}</Text>
      ) : null}
    </Sheet>
  )
}
