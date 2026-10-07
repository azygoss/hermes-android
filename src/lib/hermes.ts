import { create } from 'zustand'

import { RestClient } from '@/lib/api/rest'
import { refreshSession, wsUrl, type PasswordSession } from '@/lib/auth'
import { AuthError, GatewayClient, type ConnectionState } from '@/lib/gateway/client'
import { connectionSecrets, useConnections, type Connection } from '@/store/connections'

/** One live link to a Hermes backend: the JSON-RPC socket plus the REST client. */
export class HermesConnection {
  readonly gateway: GatewayClient
  readonly rest: RestClient
  private session: PasswordSession | null = null
  private token: string | null = null
  private refreshing: Promise<boolean> | null = null
  /** Set only when the backend answered "session_expired"; a phone that was merely offline is not expired. */
  private expired = false

  constructor(readonly conn: Connection) {
    this.gateway = new GatewayClient({
      getUrl: () => this.socketUrl(),
      headers: conn.headers,
      onAuthFailure: async () => (await this.refresh()) || (this.conn.authMode === 'password' && !this.expired),
    })
    this.rest = new RestClient({
      baseUrl: conn.baseUrl,
      authHeaders: () => this.authHeaders(),
      extraHeaders: conn.headers,
      onUnauthorized: () => this.refresh(),
      profile: () => this.profile,
    })
  }

  get profile() {
    return useConnections.getState().connections.find((c) => c.id === this.conn.id)?.profile ?? null
  }

  async load() {
    if (this.conn.authMode === 'token') this.token = await connectionSecrets.getToken(this.conn.id)
    else this.session = await connectionSecrets.getSession(this.conn.id)
  }

  private async ensureFresh() {
    if (this.conn.authMode !== 'password') return
    if (!this.session) throw new AuthError('Sign in to this Hermes backend again.')
    if (this.session.expiresAt - Date.now() < 60_000) {
      const ok = await this.refresh()
      if (!ok) {
        if (this.expired) throw new AuthError('Your Hermes login expired. Sign in again.')
        // A transient failure with a still-valid access token can ride on the old token.
        if (this.session.expiresAt > Date.now()) return
        throw new Error('Could not refresh the Hermes login.')
      }
    }
  }

  async authHeaders(): Promise<Record<string, string>> {
    if (this.conn.authMode === 'token') return this.token ? { 'X-Hermes-Session-Token': this.token } : {}
    await this.ensureFresh()
    return { Authorization: `Bearer ${this.session!.accessToken}` }
  }

  /** Credential for query-string auth (WebSocket upgrades, media URLs). */
  async queryCredential(): Promise<string> {
    if (this.conn.authMode === 'token') {
      if (!this.token) throw new AuthError('No session token saved for this connection.')
      return this.token
    }
    await this.ensureFresh()
    return this.session!.accessToken
  }

  async socketUrl(path = '/api/ws', extra: Record<string, string> = {}) {
    const token = await this.queryCredential()
    const profile = this.profile
    return wsUrl(this.conn.baseUrl, path, { ...extra, ...(profile && path !== '/api/ws' ? { profile } : {}), token })
  }

  refresh(): Promise<boolean> {
    if (this.conn.authMode !== 'password' || !this.session) return Promise.resolve(false)
    this.refreshing ??= (async () => {
      try {
        // The background task refreshes in the same storage but another promise; a rotated
        // refresh token already on disk is newer than ours — adopt it instead of failing.
        const stored = await connectionSecrets.getSession(this.conn.id).catch(() => null)
        if (stored && stored.refreshToken !== this.session!.refreshToken && stored.expiresAt - Date.now() > 60_000) {
          this.session = stored
          return true
        }
        const s = await refreshSession(this.conn.baseUrl, this.session!, this.conn.headers)
        this.session = s
        this.expired = false
        await connectionSecrets.setSession(this.conn.id, s)
        return true
      } catch (e) {
        if (e instanceof Error && e.message === 'session_expired') {
          // One last check: a concurrent refresh may have landed while ours was in flight.
          const newer = await connectionSecrets.getSession(this.conn.id).catch(() => null)
          if (newer && newer.refreshToken !== this.session!.refreshToken && newer.expiresAt - Date.now() > 60_000) {
            this.session = newer
            return true
          }
          this.expired = true
        }
        return false
      }
    })().finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }

  dispose() {
    this.gateway.close()
  }
}

interface RuntimeState {
  hermes: HermesConnection | null
  state: ConnectionState
  error: string | null
  ready: GatewayReady | null
  activate: (conn: Connection | null) => Promise<void>
}

type GatewayReady = NonNullable<GatewayClient['ready']>

/** Serialises activate() calls: a superseded activation must not open a second socket. */
let activationSeq = 0

export const useRuntime = create<RuntimeState>((set, get) => ({
  hermes: null,
  state: 'idle',
  error: null,
  ready: null,
  activate: async (conn) => {
    const seq = ++activationSeq
    get().hermes?.dispose()
    if (!conn) {
      set({ hermes: null, state: 'idle', error: null, ready: null })
      return
    }
    const h = new HermesConnection(conn)
    await h.load()
    // A newer activate() arrived while secrets loaded; leave its runtime alone.
    if (seq !== activationSeq) {
      h.dispose()
      return
    }
    h.gateway.onState((state) => {
      if (get().hermes !== h) return
      set({ state, error: h.gateway.lastError, ready: h.gateway.ready })
      if (state === 'open') useConnections.getState().touch(conn.id)
    })
    set({ hermes: h, state: 'connecting', error: null, ready: null })
    h.gateway.connect()
  },
}))

/** The active connection; throws when called before one is set up (screens are gated on it). */
export function hermes(): HermesConnection {
  const h = useRuntime.getState().hermes
  if (!h) throw new Error('No Hermes connection is active.')
  return h
}

export const rpc = () => hermes().gateway
export const rest = () => hermes().rest

/** The Hermes profile this phone works in, safe to call during render before the socket exists. */
export function useProfile(): string | null {
  return useConnections((s) => s.connections.find((c) => c.id === s.activeId)?.profile ?? null)
}
