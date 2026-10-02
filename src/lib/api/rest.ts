export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

type Query = Record<string, string | number | boolean | null | undefined>

export interface RestOptions {
  query?: Query
  body?: unknown
  /** Skip the active-profile query param (for machine-level endpoints). */
  noProfile?: boolean
  timeoutMs?: number
  headers?: Record<string, string>
}

export interface RestDeps {
  baseUrl: string
  authHeaders: () => Promise<Record<string, string>>
  extraHeaders?: Record<string, string>
  /** Return true when credentials were refreshed and the call should be retried. */
  onUnauthorized: () => Promise<boolean>
  profile: () => string | null | undefined
}

function buildQuery(query: Query | undefined) {
  if (!query) return ''
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

function detailOf(body: unknown, status: number) {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    const d = b.detail ?? b.error ?? b.message
    if (typeof d === 'string') return d
    if (Array.isArray(d)) return d.map((x) => (typeof x === 'object' && x && 'msg' in x ? String(x.msg) : String(x))).join('; ')
    if (d && typeof d === 'object') return JSON.stringify(d)
  }
  if (typeof body === 'string' && body.trim()) return body.slice(0, 300)
  return `HTTP ${status}`
}

export class RestClient {
  constructor(private readonly deps: RestDeps) {}

  get baseUrl() {
    return this.deps.baseUrl
  }

  url(path: string, query?: Query, { noProfile }: { noProfile?: boolean } = {}) {
    const profile = noProfile ? undefined : this.deps.profile()
    return `${this.deps.baseUrl}${path}${buildQuery({ ...(profile ? { profile } : {}), ...query })}`
  }

  async request<T = any>(method: string, path: string, opts: RestOptions = {}, retried = false): Promise<T> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000)
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.deps.extraHeaders,
      ...(await this.deps.authHeaders()),
      ...opts.headers,
    }
    let body: BodyInit | undefined
    if (opts.body instanceof FormData) body = opts.body
    else if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(opts.body)
    }
    let res: Response
    try {
      res = await fetch(this.url(path, opts.query, { noProfile: opts.noProfile }), {
        method,
        headers,
        body,
        signal: ctrl.signal,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new HttpError(/abort/i.test(msg) ? `${path} timed out` : `Network error: ${msg}`, 0)
    } finally {
      clearTimeout(timer)
    }
    if (res.status === 401 && !retried && (await this.deps.onUnauthorized())) {
      return this.request(method, path, opts, true)
    }
    const text = await res.text()
    let parsed: unknown = text
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      // keep raw text
    }
    if (!res.ok) throw new HttpError(detailOf(parsed, res.status), res.status, parsed)
    return parsed as T
  }

  get<T = any>(path: string, opts?: RestOptions) {
    return this.request<T>('GET', path, opts)
  }
  post<T = any>(path: string, body?: unknown, opts?: RestOptions) {
    return this.request<T>('POST', path, { ...opts, body })
  }
  put<T = any>(path: string, body?: unknown, opts?: RestOptions) {
    return this.request<T>('PUT', path, { ...opts, body })
  }
  patch<T = any>(path: string, body?: unknown, opts?: RestOptions) {
    return this.request<T>('PATCH', path, { ...opts, body })
  }
  del<T = any>(path: string, body?: unknown, opts?: RestOptions) {
    return this.request<T>('DELETE', path, { ...opts, body })
  }
}
