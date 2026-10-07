import * as Clipboard from 'expo-clipboard'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

import { confirm } from '@/components/ui/Dialogs'
import { t } from '@/i18n'
import { relativeTime } from '@/lib/format'
import { CrashReport, type LastExit } from '../../modules/hermes-keepalive'

/** The app's own crash/ANR report from the previous run, if one is still unacknowledged. */
export function lastExit(): LastExit | null {
  try {
    return CrashReport.lastExit()
  } catch {
    return null
  }
}

/** Plain-text report for the clipboard — app/Android version, reason, description, trace. */
export function exitReportText(e: LastExit) {
  const time = new Date(e.timestamp)
  return [
    `Hermes ${Constants.expoConfig?.version ?? '?'} · Android ${Platform.Version}`,
    `reason: ${e.reason} · ${Number.isNaN(time.getTime()) ? e.timestamp : time.toISOString()}`,
    e.description,
    '',
    e.trace || '(no trace captured)',
  ].join('\n')
}

export async function copyExitReport(e: LastExit) {
  await Clipboard.setStringAsync(exitReportText(e))
}

export function acknowledgeExit() {
  try {
    CrashReport.acknowledge()
  } catch {}
}

let checked = false
/** Once per launch: surface the last crash/ANR in the standard dialog, then acknowledge it. */
export async function promptLastExit() {
  if (checked) return
  checked = true
  const exit = lastExit()
  if (!exit) return
  try {
    const copy = await confirm(t('Hermes closed unexpectedly last time'), `${exit.description} · ${relativeTime(exit.timestamp)}`, {
      confirmLabel: t('Copy report'),
    })
    if (copy) await copyExitReport(exit)
  } finally {
    acknowledgeExit()
  }
}
