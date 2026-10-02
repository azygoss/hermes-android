import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'

import { useRuntime } from '@/lib/hermes'
import { queryClient } from '@/lib/query'
import { handleEvent, handleServerRequest, resetChat } from '@/store/chat'
import { useConnections } from '@/store/connections'

/** Keeps the runtime bound to the active connection and routes gateway traffic into the stores. */
export function GatewayBridge() {
  const active = useConnections((s) => s.connections.find((c) => c.id === s.activeId) ?? null)
  const hermes = useRuntime((s) => s.hermes)
  const identity = active ? `${active.id}|${active.baseUrl}|${active.authMode}` : ''

  const first = useRef(true)
  useEffect(() => {
    resetChat()
    // At launch the cache was just restored from disk for this same connection (see persistOptions' buster).
    if (!first.current) queryClient.clear()
    first.current = false
    void useRuntime
      .getState()
      .activate(useConnections.getState().connections.find((c) => c.id === useConnections.getState().activeId) ?? null)
  }, [identity])

  useEffect(() => {
    if (!hermes) return
    const offEvent = hermes.gateway.onEvent(handleEvent)
    hermes.gateway.setRequestHandler(handleServerRequest)
    return () => {
      offEvent()
      hermes.gateway.setRequestHandler(null)
    }
  }, [hermes])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') useRuntime.getState().hermes?.gateway.nudge()
    })
    return () => sub.remove()
  }, [])

  return null
}

/** Re-activate the current connection, e.g. after editing its credentials. */
export async function reconnectActive() {
  const { connections, activeId } = useConnections.getState()
  const conn = connections.find((c) => c.id === activeId) ?? null
  resetChat()
  queryClient.clear()
  await useRuntime.getState().activate(conn)
}
