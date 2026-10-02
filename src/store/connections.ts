import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { AuthMode, PasswordSession } from '@/lib/auth'
import { persistStorage, secrets } from '@/lib/storage'

export interface Connection {
  id: string
  name: string
  baseUrl: string
  authMode: AuthMode
  username?: string
  provider?: string
  /** Extra headers for access proxies (e.g. Cloudflare Access). Stored in plain prefs. */
  headers?: Record<string, string>
  /** Hermes profile this phone works in; null = the backend's launch profile. */
  profile?: string | null
  lastConnectedAt?: number
}

interface ConnectionsState {
  connections: Connection[]
  activeId: string | null
  upsert: (c: Connection) => void
  remove: (id: string) => Promise<void>
  setActive: (id: string | null) => void
  setProfile: (id: string, profile: string | null) => void
  touch: (id: string) => void
}

export const useConnections = create<ConnectionsState>()(
  persist(
    (set, get) => ({
      connections: [],
      activeId: null,
      upsert: (c) =>
        set((s) => ({
          connections: s.connections.some((x) => x.id === c.id)
            ? s.connections.map((x) => (x.id === c.id ? c : x))
            : [...s.connections, c],
        })),
      remove: async (id) => {
        await secrets.remove(tokenKey(id))
        await secrets.remove(sessionKey(id))
        set((s) => ({
          connections: s.connections.filter((x) => x.id !== id),
          activeId: s.activeId === id ? (s.connections.find((x) => x.id !== id)?.id ?? null) : s.activeId,
        }))
      },
      setActive: (id) => set({ activeId: id }),
      setProfile: (id, profile) =>
        set((s) => ({ connections: s.connections.map((x) => (x.id === id ? { ...x, profile } : x)) })),
      touch: (id) =>
        set((s) => ({ connections: s.connections.map((x) => (x.id === id ? { ...x, lastConnectedAt: Date.now() } : x)) })),
    }),
    { name: 'hermes.connections', storage: persistStorage, version: 1 },
  ),
)

export const activeConnection = () => {
  const { connections, activeId } = useConnections.getState()
  return connections.find((c) => c.id === activeId) ?? null
}

const tokenKey = (id: string) => `conn.${id}.token`
const sessionKey = (id: string) => `conn.${id}.session`

export const connectionSecrets = {
  getToken: (id: string) => secrets.get(tokenKey(id)),
  setToken: (id: string, token: string) => secrets.set(tokenKey(id), token),
  async getSession(id: string): Promise<PasswordSession | null> {
    const raw = await secrets.get(sessionKey(id))
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  },
  setSession: (id: string, session: PasswordSession | null) =>
    secrets.set(sessionKey(id), session ? JSON.stringify(session) : null),
}
