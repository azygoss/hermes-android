import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import { File, Paths } from 'expo-file-system'
import * as Speech from 'expo-speech'
import { Platform } from 'react-native'

import { resolveLanguage } from '@/i18n'
import { rest } from '@/lib/hermes'
import { useSettings } from '@/store/settings'

export async function fileToBase64(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => reject(r.error)
      r.readAsDataURL(blob)
    })
    return dataUrl.slice(dataUrl.indexOf(',') + 1)
  }
  return new File(uri).base64()
}

/** Send a recording to the backend's speech-to-text provider. */
export async function transcribe(uri: string, mimeType = 'audio/m4a'): Promise<string> {
  const b64 = await fileToBase64(uri)
  const res = await rest().post<{ ok?: boolean; transcript?: string; error?: string; detail?: string }>(
    '/api/audio/transcribe',
    { data_url: `data:${mimeType};base64,${b64}`, mime_type: mimeType },
    { timeoutMs: 120_000 },
  )
  if (res.ok === false) throw new Error(res.error || res.detail || 'Transcription failed')
  return (res.transcript ?? '').trim()
}

export function stripMarkdown(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/[*_~>|]/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

let player: AudioPlayer | null = null
let speaking = false

export function isSpeaking() {
  return speaking
}

export async function stopSpeaking() {
  speaking = false
  Speech.stop()
  try {
    player?.pause()
    player?.remove()
  } catch {
    // already released
  }
  player = null
}

function speakOnDevice(text: string) {
  const lang = resolveLanguage(useSettings.getState().language)
  speaking = true
  Speech.speak(text, {
    language: lang === 'tr' ? 'tr-TR' : 'en-US',
    onDone: () => {
      speaking = false
    },
    onStopped: () => {
      speaking = false
    },
  })
}

/** Read text aloud with the configured engine, falling back to the phone's TTS. */
export async function speak(text: string) {
  const clean = stripMarkdown(text).slice(0, 4000)
  if (!clean) return
  await stopSpeaking()
  if (useSettings.getState().ttsEngine === 'device') {
    speakOnDevice(clean)
    return
  }
  try {
    const res = await rest().post<{ ok?: boolean; data_url?: string; mime_type?: string }>(
      '/api/audio/speak',
      { text: clean },
      { timeoutMs: 90_000 },
    )
    if (!res.data_url) throw new Error('no audio')
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => {})
    let source = res.data_url
    if (Platform.OS !== 'web') {
      const ext = (res.mime_type ?? 'audio/mpeg').includes('wav') ? 'wav' : (res.mime_type ?? '').includes('ogg') ? 'ogg' : 'mp3'
      const file = new File(Paths.cache, `hermes-tts-${Date.now()}.${ext}`)
      file.write(res.data_url.slice(res.data_url.indexOf(',') + 1), { encoding: 'base64' })
      source = file.uri
    }
    player = createAudioPlayer(source)
    speaking = true
    player.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish) speaking = false
    })
    player.play()
  } catch {
    speakOnDevice(clean)
  }
}
