import { useEffect, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'

import { Badge, Loading, Sheet, Text } from '@/components/ui'
import { useT } from '@/i18n'
import { rest } from '@/lib/hermes'
import { radius, space, useTheme } from '@/theme'

export interface RunningAction {
  title: string
  name: string
}

/** Follows a backend background action (/api/actions/{name}/status) and streams its log. */
export function ActionRunner({
  action,
  onClose,
  onDone,
}: {
  action: RunningAction | null
  onClose: () => void
  onDone?: (lines: string[]) => void
}) {
  const t = useT()
  const { c } = useTheme()
  const [lines, setLines] = useState<string[]>([])
  const [running, setRunning] = useState(true)
  const [exit, setExit] = useState<number | null>(null)
  const scroll = useRef<ScrollView>(null)

  useEffect(() => {
    if (!action) return
    setLines([])
    setRunning(true)
    setExit(null)
    let stop = false
    const tick = async () => {
      while (!stop) {
        try {
          const st = await rest().get<{ lines: string[]; running: boolean; exit_code: number | null }>(
            `/api/actions/${encodeURIComponent(action.name)}/status`,
            {
              query: { lines: 400 },
              noProfile: true,
            },
          )
          setLines(st.lines)
          if (!st.running) {
            setRunning(false)
            setExit(st.exit_code)
            onDone?.(st.lines)
            return
          }
        } catch {
          // transient; keep polling
        }
        await new Promise((r) => setTimeout(r, 1500))
      }
    }
    void tick()
    return () => {
      stop = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action?.name])

  return (
    <Sheet visible={!!action} onClose={onClose} title={action?.title} heightRatio={0.92}>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        {running ? (
          <Loading label={t('Running on the backend…')} />
        ) : (
          <Badge label={exit === 0 ? t('finished') : t('exit code {n}', { n: exit ?? '?' })} tone={exit === 0 ? 'success' : 'danger'} />
        )}
      </View>
      <ScrollView
        ref={scroll}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        style={{ backgroundColor: c.codeBg, borderRadius: radius.md, maxHeight: 520 }}
        contentContainerStyle={{ padding: space.md }}
      >
        <Text mono variant="caption" selectable>
          {lines.join('').replace(/\x1b\[[0-9;]*m/g, '') || '…'}
        </Text>
      </ScrollView>
    </Sheet>
  )
}
