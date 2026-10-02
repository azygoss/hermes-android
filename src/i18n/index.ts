import { getLocales } from 'expo-localization'

import { useSettings, type Language } from '@/store/settings'

import { tr } from './tr'

// English source strings are the keys; a missing translation falls back to English.
const catalogs: Record<Exclude<Language, 'system'>, Record<string, string> | null> = { en: null, tr }

export function resolveLanguage(lang: Language): Exclude<Language, 'system'> {
  if (lang !== 'system') return lang
  const code = getLocales()[0]?.languageCode ?? 'en'
  return code === 'tr' ? 'tr' : 'en'
}

function format(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`))
}

export function translate(lang: Language, text: string, vars?: Record<string, string | number>) {
  const catalog = catalogs[resolveLanguage(lang)]
  return format(catalog?.[text] ?? text, vars)
}

/** Non-hook access for stores and callbacks. */
export const t = (text: string, vars?: Record<string, string | number>) => translate(useSettings.getState().language, text, vars)

export function useT() {
  const lang = useSettings((s) => s.language)
  return (text: string, vars?: Record<string, string | number>) => translate(lang, text, vars)
}
