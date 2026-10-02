import { Platform } from 'react-native'

import type { BackendGatewayEventMap, RpcMethod, RpcMethods, ServerRequestMap } from './contract.generated'

export type RpcParams<M extends RpcMethod> = RpcMethods[M]['params']
export type RpcResult<M extends RpcMethod> = RpcMethods[M]['result']
export type EventName = keyof BackendGatewayEventMap

export interface GatewayEvent<T extends EventName = EventName> {
  type: T
  session_id: string
  seq?: number
  payload: BackendGatewayEventMap[T]
}

export type AnyGatewayEvent = { [K in EventName]: GatewayEvent<K> }[EventName]

export interface ServerRequest<M extends keyof ServerRequestMap = keyof ServerRequestMap> {
  id: string
  method: M
  params: ServerRequestMap[M]['params']
  replayed?: boolean
}

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'

export class RpcError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly data?: unknown,
  ) {
    super(message)
    this.name = 'RpcError'
  }
}

export class AuthError extends Error {
  constructor(message = 'Authentication failed') {
    super(message)
    this.name = 'AuthError'
  }
}

export interface GatewayOptions {
  /** Builds a fresh ws(s):// URL (with token or ticket) for every connect attempt. */
  getUrl: () => Promise<string>
  headers?: Record<string, string>
  /** Called when the server closes with 4401; return true to retry with a fresh URL. */
  onAuthFailure?: () => Promise<boolean>
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

const HEARTBEAT_MS = 15_000
const DEAD_AFTER_MS = 45_000
const DEFAULT_TIMEOUT_MS = 90_000

export class GatewayClient {
  state: ConnectionState = 'idle'
  ready: BackendGatewayEventMap['gateway.ready'] | null = null
  lastError: string | null = null
  capabilities: { server_requests: string[]; declines_not_shown?: boolean } | null = null

  private ws: WebSocket | null = null
  private pending = new Map<string, Pending>()
  private nextId = 1
  private eventListeners = new Set<(event: AnyGatewayEvent) => void>()
  private stateListeners = new Set<(state: ConnectionState) => void>()
  private requestHandler: ((request: ServerRequest) => void) | null = null
  private lastSeq = new Map<string, number>()
  private replaying = new Map<string, AnyGatewayEvent[]>()
  private epoch: string | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private attempt = 0
  private lastInbound = 0
  private closedByUser = false
  private openWaiters: { resolve: () => void; reject: (e: unknown) => void }[] = []

  constructor(private readonly options: GatewayOptions) {}

  connect() {
    this.closedByUser = false
    if (this.state === 'open' || this.state === 'connecting') return
    void this.open()
  }

  close() {
    this.closedByUser = true
    this.clearTimers()
    this.ws?.close(1000, 'client closed')
    this.ws = null
    this.failPending(new Error('Connection closed'))
    this.setState('closed')
  }

  /** Reconnect now (e.g. app returned to the foreground) instead of waiting for the backoff. */
  nudge() {
    if (this.closedByUser) return
    if (this.state === 'open') {
      if (Date.now() - this.lastInbound > DEAD_AFTER_MS) this.ws?.close(4000, 'stale')
      return
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
      void this.open()
    }
  }

  onEvent(listener: (event: AnyGatewayEvent) => void) {
    this.eventListeners.add(listener)
    return () => void this.eventListeners.delete(listener)
  }

  onState(listener: (state: ConnectionState) => void) {
    this.stateListeners.add(listener)
    return () => void this.stateListeners.delete(listener)
  }

  setRequestHandler(handler: ((request: ServerRequest) => void) | null) {
    this.requestHandler = handler
  }

  async request<M extends RpcMethod>(
    method: M,
    params: RpcParams<M>,
    { timeoutMs = DEFAULT_TIMEOUT_MS }: { timeoutMs?: number } = {},
  ): Promise<RpcResult<M>> {
    await this.waitOpen(timeoutMs)
    const id = `r${this.nextId++}`
    return new Promise<RpcResult<M>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new RpcError(`${method} timed out`, -32000))
      }, timeoutMs)
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
      this.send({ jsonrpc: '2.0', id, method, params: params ?? {} })
    })
  }

  /** Untyped escape hatch for methods newer than the bundled contract. */
  call(method: string, params: Record<string, unknown> = {}, opts?: { timeoutMs?: number }) {
    return this.request(method as RpcMethod, params as never, opts) as Promise<any>
  }

  respond(id: string, result: unknown) {
    this.send({ jsonrpc: '2.0', id, result })
  }

  respondError(id: string, code: number, message: string) {
    this.send({ jsonrpc: '2.0', id, error: { code, message } })
  }

  /** Re-deliver open server requests returned by session.resume / activate / events.since. */
  deliverOpenRequests(requests: { id: string; method: string; params: unknown }[] | null | undefined) {
    for (const r of requests ?? []) {
      this.requestHandler?.({ id: r.id, method: r.method as never, params: r.params as never, replayed: true })
    }
  }

  forgetSession(sessionId: string) {
    this.lastSeq.delete(sessionId)
  }

  private setState(state: ConnectionState) {
    if (this.state === state) return
    this.state = state
    for (const l of this.stateListeners) l(state)
    if (state === 'open') {
      for (const w of this.openWaiters.splice(0)) w.resolve()
    }
  }

  private waitOpen(timeoutMs: number) {
    if (this.state === 'open') return Promise.resolve()
    if (this.state === 'idle' || this.state === 'closed') this.connect()
    return new Promise<void>((resolve, reject) => {
      const waiter = {
        resolve: () => {
          clearTimeout(timer)
          resolve()
        },
        reject,
      }
      const timer = setTimeout(() => {
        this.openWaiters = this.openWaiters.filter((w) => w !== waiter)
        reject(new Error(this.lastError ?? 'Not connected to Hermes'))
      }, timeoutMs)
      this.openWaiters.push(waiter)
    })
  }

  private async open() {
    this.setState(this.attempt === 0 ? 'connecting' : 'reconnecting')
    let url: string
    try {
      url = await this.options.getUrl()
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e)
      if (e instanceof AuthError) {
        this.failOpenWaiters(e)
        this.setState('closed')
        return
      }
      this.scheduleReconnect()
      return
    }
    if (this.closedByUser) return

    let ws: WebSocket
    try {
      ws =
        Platform.OS === 'web'
          ? new WebSocket(url)
          : // React Native's WebSocket accepts headers as a third argument.
            new (WebSocket as unknown as new (u: string, p: null, o: { headers?: Record<string, string> }) => WebSocket)(url, null, {
              headers: this.options.headers,
            })
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e)
      this.scheduleReconnect()
      return
    }
    this.ws = ws
    this.lastInbound = Date.now()

    ws.onmessage = (msg) => {
      if (this.ws !== ws) return
      this.lastInbound = Date.now()
      this.handleFrame(typeof msg.data === 'string' ? msg.data : String(msg.data))
    }
    ws.onerror = (e) => {
      const message = (e as unknown as { message?: string }).message
      if (message) this.lastError = message
    }
    ws.onclose = (e) => {
      if (this.ws !== ws) return
      this.ws = null
      this.clearTimers()
      this.failPending(new Error('Connection lost'))
      if (this.closedByUser) {
        this.setState('closed')
        return
      }
      if (e.code === 4401) {
        this.lastError = 'The Hermes backend rejected the credentials'
        void (this.options.onAuthFailure?.() ?? Promise.resolve(false)).then((retry) => {
          if (retry && !this.closedByUser) this.scheduleReconnect()
          else {
            this.failOpenWaiters(new AuthError(this.lastError ?? undefined))
            this.setState('closed')
          }
        })
        return
      }
      if (e.code === 4403) this.lastError = 'The Hermes backend refused this connection (host or origin not allowed)'
      else if (!this.lastError || this.state === 'open') this.lastError = e.reason || 'Connection lost'
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.closedByUser) return
    this.setState('reconnecting')
    const base = Math.min(15_000, 500 * 2 ** Math.min(this.attempt, 5))
    const delay = base / 2 + Math.random() * (base / 2)
    this.attempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.open()
    }, delay)
  }

  private clearTimers() {
    if (this.heartbeat) clearInterval(this.heartbeat)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.heartbeat = null
    this.reconnectTimer = null
  }

  private failPending(error: Error) {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(error)
    }
    this.pending.clear()
  }

  private failOpenWaiters(error: Error) {
    for (const w of this.openWaiters.splice(0)) w.reject(error)
  }

  private send(frame: unknown) {
    if (!this.ws || this.ws.readyState !== 1) throw new Error('Not connected to Hermes')
    this.ws.send(JSON.stringify(frame))
  }

  private handleFrame(raw: string) {
    let frame: any
    try {
      frame = JSON.parse(raw)
    } catch {
      return
    }
    if (frame.method === 'event') {
      this.handleEvent(frame.params as AnyGatewayEvent)
      return
    }
    if (typeof frame.method === 'string' && frame.id != null) {
      this.handleServerRequest({ id: String(frame.id), method: frame.method, params: frame.params ?? {} })
      return
    }
    const p = frame.id != null ? this.pending.get(String(frame.id)) : undefined
    if (!p) return
    this.pending.delete(String(frame.id))
    clearTimeout(p.timer)
    if (frame.error) p.reject(new RpcError(frame.error.message ?? 'RPC error', frame.error.code ?? -32603, frame.error.data))
    else p.resolve(frame.result)
  }

  private handleServerRequest(request: ServerRequest) {
    if (!this.requestHandler) {
      this.respondError(request.id, -32601, 'no handler')
      return
    }
    this.requestHandler(request)
  }

  private handleEvent(event: AnyGatewayEvent) {
    if (event.type === 'gateway.ready') {
      void this.onReady(event.payload as BackendGatewayEventMap['gateway.ready'])
      return
    }
    const sid = event.session_id
    if (sid && this.replaying.has(sid)) {
      this.replaying.get(sid)!.push(event)
      return
    }
    this.dispatch(event)
  }

  private dispatch(event: AnyGatewayEvent) {
    const sid = event.session_id
    if (sid && typeof event.seq === 'number') {
      const last = this.lastSeq.get(sid) ?? 0
      if (event.seq <= last) return
      this.lastSeq.set(sid, event.seq)
    }
    for (const l of this.eventListeners) {
      try {
        l(event)
      } catch (e) {
        console.warn('gateway listener failed', e)
      }
    }
  }

  private async onReady(payload: BackendGatewayEventMap['gateway.ready']) {
    this.ready = payload
    this.attempt = 0
    this.lastError = null
    const epoch = (payload as { replay_epoch?: string | null }).replay_epoch ?? null
    if (epoch && this.epoch && epoch !== this.epoch) this.lastSeq.clear()
    this.epoch = epoch

    // Mark open before the handshake so request() can send it.
    this.setState('open')
    try {
      this.capabilities = (await this.request(
        'client.capabilities',
        { server_requests: true },
        {
          timeoutMs: 15_000,
        },
      )) as never
    } catch {
      // Older backends lack the method; server requests then go unanswered.
    }

    if ((payload as { heartbeat?: boolean }).heartbeat !== false) {
      this.heartbeat = setInterval(() => {
        if (Date.now() - this.lastInbound > DEAD_AFTER_MS) {
          this.ws?.close(4000, 'heartbeat timeout')
          return
        }
        this.call('gateway.ping', {}, { timeoutMs: HEARTBEAT_MS * 2 }).catch(() => {})
      }, HEARTBEAT_MS)
    }

    for (const [sid, last] of [...this.lastSeq]) void this.replay(sid, last)

    for (const l of this.eventListeners) l(this.syntheticReady(payload))
  }

  private syntheticReady(payload: BackendGatewayEventMap['gateway.ready']): AnyGatewayEvent {
    return { type: 'gateway.ready', session_id: '', payload } as AnyGatewayEvent
  }

  private async replay(sid: string, last: number) {
    this.replaying.set(sid, [])
    try {
      const res = (await this.call('session.events.since', { session_id: sid, last_seen: last }, { timeoutMs: 20_000 })) as {
        events?: AnyGatewayEvent[]
        truncated?: boolean
        open_requests?: { id: string; method: string; params: unknown }[]
      }
      if (res?.truncated) {
        // Too far behind: let listeners refetch state instead of applying a partial stream.
        for (const l of this.eventListeners)
          l({ type: 'session.reclaimed', session_id: sid, payload: { reason: 'replay_truncated' } } as never)
      } else {
        for (const e of res?.events ?? []) this.dispatch({ ...e, session_id: e.session_id || sid })
      }
      this.deliverOpenRequests(res?.open_requests)
    } catch {
      // The session may be gone on the server; live events keep flowing regardless.
    } finally {
      const held = this.replaying.get(sid) ?? []
      this.replaying.delete(sid)
      for (const e of held) this.dispatch(e)
    }
  }
}
