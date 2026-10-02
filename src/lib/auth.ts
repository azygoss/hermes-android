import * as Crypto from 'expo-crypto'

export type AuthMode = 'token' | 'password'

export interface ProbeResult {
  reachable: boolean
  authRequired: boolean
  version?: string
  displayVersion?: string
  providers: { name: string; display_name: string; supports_password: boolean }[]
  error?: string
}

export interface PasswordSession {
  accessToken: string
  refreshToken: string
  expiresAt: number
  provider: string
  userId?: string
}

/** Accepts "host:9119", "http://host:9119/", "https://h/prefix/api" and returns "scheme://host[:port][/prefix]". */
export function normalizeBaseUrl(input: string): string {
  let url = input.trim()
  if (!url) return ''
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`
  url = url.replace(/\/+$/, '').replace(/\/api$/i, '')
  return url
}

export function wsUrl(baseUrl: string, path: string, query: Record<string, string>) {
  const u = baseUrl.replace(/^http/i, 'ws')
  const qs = Object.entries(query)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  return `${u}${path}${qs ? `?${qs}` : ''}`
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10_000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

function describeNetworkError(e: unknown, baseUrl: string) {
  const msg = e instanceof Error ? e.message : String(e)
  if (/abort/i.test(msg)) return `No answer from ${baseUrl} within 10 seconds.`
  return `Could not reach ${baseUrl}: ${msg}`
}

export async function probe(baseUrl: string, headers: Record<string, string> = {}): Promise<ProbeResult> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/api/health`, { headers })
    if (!res.ok) {
      return { reachable: false, authRequired: false, providers: [], error: `/api/health answered HTTP ${res.status}. Is this a Hermes backend (hermes serve)?` }
    }
    const health = await res.json()
    const result: ProbeResult = {
      reachable: true,
      authRequired: !!health.auth_required,
      version: health.version,
      displayVersion: health.displayVersion,
      providers: [],
    }
    if (result.authRequired) {
      const p = await fetchWithTimeout(`${baseUrl}/api/auth/providers`, { headers }).catch(() => null)
      if (p?.ok) result.providers = (await p.json()).providers ?? []
    }
    return result
  } catch (e) {
    return { reachable: false, authRequired: false, providers: [], error: describeNetworkError(e, baseUrl) }
  }
}

/** On a loopback (token-mode) backend with a web build, GET / embeds the session token. */
export async function detectToken(baseUrl: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/`, {})
    const html = await res.text()
    const m = html.match(/__HERMES_SESSION_TOKEN__\s*=\s*"([^"]+)"/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

/** Checks a token-mode credential against an authenticated endpoint. */
export async function verifyToken(baseUrl: string, token: string, headers: Record<string, string> = {}) {
  // /api/auth/me only answers in password mode, so use a cheap authenticated read.
  const res = await fetchWithTimeout(`${baseUrl}/api/sessions?limit=1`, {
    headers: { ...headers, 'X-Hermes-Session-Token': token },
  })
  return res.ok
}

function base64url(bytes: Uint8Array) {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function pkcePair() {
  const verifier = base64url(Crypto.getRandomBytes(48))
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  })
  const challenge = digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return { verifier, challenge, state: base64url(Crypto.getRandomBytes(16)) }
}

function cookieHeaderFrom(res: Response) {
  const raw = res.headers.get('set-cookie')
  if (!raw) return null
  return raw
    .split(/,(?=\s*[A-Za-z0-9_\-.]+=)/)
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ')
}

async function readError(res: Response) {
  try {
    const body = await res.json()
    return body.detail || body.error || body.message || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

function toSession(body: any): PasswordSession {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: typeof body.expires_at === 'number' ? body.expires_at * (body.expires_at < 1e12 ? 1000 : 1) : Date.now() + 3600_000,
    provider: body.provider ?? 'basic',
    userId: body.user_id,
  }
}

/**
 * RFC 8252 native PKCE flow against a password provider: authorize sets a PKCE cookie,
 * password-login answers the redirect URL with the code, and the code is exchanged for tokens.
 */
export async function passwordLogin(
  baseUrl: string,
  provider: string,
  username: string,
  password: string,
  headers: Record<string, string> = {},
): Promise<PasswordSession> {
  const { verifier, challenge, state } = await pkcePair()
  const redirect = 'http://127.0.0.1:53682/cb'
  const authorize = await fetchWithTimeout(
    `${baseUrl}/auth/native/authorize?provider=${encodeURIComponent(provider)}&code_challenge=${challenge}` +
      `&code_challenge_method=S256&redirect_uri=${encodeURIComponent(redirect)}&state=${state}`,
    { headers, credentials: 'include' },
  )
  const cookie = cookieHeaderFrom(authorize)

  const login = await fetchWithTimeout(`${baseUrl}/auth/password-login`, {
    method: 'POST',
    credentials: 'include',
    headers: { ...headers, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ provider, username, password, next: '' }),
  })
  if (login.status === 401) throw new Error('Wrong username or password.')
  if (login.status === 429) throw new Error('Too many attempts. Wait a minute and try again.')
  if (!login.ok) throw new Error(`Login failed: ${await readError(login)}`)
  const body = await login.json()
  const next: string = body.next ?? ''
  const code = next.match(/[?&]code=([^&]+)/)?.[1]
  if (!code) throw new Error('The backend did not return a login code. Update Hermes to a build with native login (June 2026 or newer).')

  const token = await fetchWithTimeout(`${baseUrl}/auth/native/token`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: decodeURIComponent(code), code_verifier: verifier }),
  })
  if (!token.ok) throw new Error(`Token exchange failed: ${await readError(token)}`)
  return toSession(await token.json())
}

export async function refreshSession(
  baseUrl: string,
  session: PasswordSession,
  headers: Record<string, string> = {},
): Promise<PasswordSession> {
  const res = await fetchWithTimeout(`${baseUrl}/auth/native/refresh`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refreshToken, provider: session.provider }),
  })
  if (!res.ok) throw new Error(res.status === 401 ? 'session_expired' : await readError(res))
  return toSession(await res.json())
}
