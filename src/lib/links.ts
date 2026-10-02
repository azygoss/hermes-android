/** hermes://connect?url=...&token=...&name=... (also accepts a bare URL). */
export function parseConnectLink(raw: string): { url?: string; token?: string; name?: string; username?: string } | null {
  const text = raw.trim()
  if (/^https?:\/\//i.test(text) && !text.includes('token=')) return { url: text }
  try {
    const u = new URL(text.replace(/^hermes:\/\//i, 'https://hermes.app/'))
    const url = u.searchParams.get('url') ?? undefined
    if (!url && !/^https?:/i.test(text)) return null
    return {
      url: url ?? `${u.protocol}//${u.host}`,
      token: u.searchParams.get('token') ?? undefined,
      name: u.searchParams.get('name') ?? undefined,
      username: u.searchParams.get('user') ?? undefined,
    }
  } catch {
    return null
  }
}
