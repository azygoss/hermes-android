# How the app talks to Hermes

Hermes for Android is a remote client of `hermes serve`, the same backend Hermes Desktop
and the web dashboard use. Nothing agent-related runs on the phone: sessions, tools,
memory, skills and model calls all live on the Hermes host. The app speaks two
protocols to that host:

- **JSON-RPC 2.0 over WebSocket** at `/api/ws` (the `tui_gateway` API). Chat, streaming,
  approvals, slash commands, models, tools, skills, MCP, profiles, projects, cron, and so on.
- **REST** under `/api/*` (the dashboard API). Session transcripts, files, analytics, logs,
  messaging platforms, pairing, webhooks, env keys, config, system operations, kanban.

The typed wire contract in `src/lib/gateway/contract.generated.ts` is copied verbatim from
`apps/shared/src/gateway-contract.generated.ts` in hermes-agent (MIT). Regenerate it from a
newer checkout with `npm run sync-contract`.

Everything below was checked against hermes-agent `0a374d16` (2026-10-02).

## Starting a backend the phone can reach

`hermes serve` listens on `127.0.0.1:9119` by default. There are two ways in.

### Token mode (loopback)

The backend accepts a static session token, but only from a loopback peer. This fits:

- Hermes running in Termux on the same phone (`http://127.0.0.1:9119`)
- an SSH local forward (`ssh -L 9119:127.0.0.1:9119 host`) from an SSH app on the phone
- `adb reverse tcp:9119 tcp:9119` during development

Fix the token so the app can store it:

```bash
HERMES_DASHBOARD_SESSION_TOKEN=<secret> hermes serve
```

Without the env var the token is random on every start. When a web build is present,
`GET /` on a loopback serve embeds it as `window.__HERMES_SESSION_TOKEN__="..."`; the app's
"Detect token" button reads it from there.

- REST: header `X-Hermes-Session-Token: <token>`
- WS: `/api/ws?token=<token>`

### Password mode (LAN, Tailscale, public)

Any non-loopback bind turns on the auth gate, and the gate refuses to start without a
provider. The simplest provider is basic auth:

```yaml
# ~/.hermes/config.yaml
dashboard:
  basic_auth:
    username: me
    password: <password>        # or password_hash
    secret: <long random string> # keeps logins valid across restarts
```

```bash
hermes serve --host 0.0.0.0
```

The app logs in with the native PKCE flow (RFC 8252) and then uses bearer tokens:

1. `GET /auth/native/authorize?provider=basic&code_challenge=<S256>&code_challenge_method=S256&redirect_uri=http://127.0.0.1:53682/cb&state=<s>`
   sets a PKCE cookie and redirects to `/login`.
2. `POST /auth/password-login` `{provider, username, password, next:""}` with that cookie
   answers `{"ok":true,"next":"http://127.0.0.1:53682/cb?code=<code>&state=<s>"}`.
   The app reads `code` from `next`; nothing listens on the redirect URI.
3. `POST /auth/native/token` `{code, code_verifier}` answers
   `{access_token, refresh_token, token_type:"Bearer", expires_at, provider, user_id}`.
4. `POST /auth/native/refresh` `{refresh_token, provider}` renews it.

- REST: `Authorization: Bearer <access_token>`
- WS: `/api/ws?token=<access_token>`

`GET /api/health` (public) tells the two modes apart: `{"ok":true,"auth_required":bool,...}`.
`GET /api/auth/providers` lists the login providers in password mode.

## WebSocket framing

One JSON object per text frame.

```jsonc
// first frame from the server
{"jsonrpc":"2.0","method":"event","params":{"type":"gateway.ready","payload":{"skin":{...},"heartbeat":true,"replay_epoch":"..."}}}
// the client must answer with this, or the agent can't ask it anything
{"jsonrpc":"2.0","id":"r1","method":"client.capabilities","params":{"server_requests":true}}
// call / result
{"jsonrpc":"2.0","id":"r2","method":"session.create","params":{"source":"android","cols":60}}
{"jsonrpc":"2.0","id":"r2","result":{"session_id":"bc39fbfa","stored_session_id":"20261002_132903_255192",...}}
// event (seq is per session and monotonic)
{"jsonrpc":"2.0","method":"event","params":{"type":"message.delta","session_id":"bc39fbfa","seq":42,"payload":{"text":"Hel"}}}
// server -> client request (string id), answered with a normal response frame
{"jsonrpc":"2.0","id":"srq-f5f9dc3895bb","method":"approval","params":{"session_id":"...","command":"rm -rf /tmp/x","choices":["once","session","always","deny"],...}}
{"jsonrpc":"2.0","id":"srq-f5f9dc3895bb","result":{"choice":"once"}}
```

- Heartbeat: `gateway.ping` every 15 s when `gateway.ready.heartbeat` is true.
- Reconnect: `session.events.since {session_id, last_seen}` replays missed events and
  re-delivers open server requests. A new `replay_epoch` means the backend restarted.
- Runtime vs stored ids: `session.create`/`session.resume` return a runtime `session_id`
  for RPC and a `stored_session_id` for REST and the session list.

## A chat turn

`prompt.submit {session_id, text}` answers `{status:"streaming"|"queued"|...}`, then:

| Event | Payload | Meaning |
|---|---|---|
| `message.start` | none | turn began |
| `reasoning.delta` / `reasoning.available` | `{text}` | model reasoning |
| `thinking.delta` | `{text}` | spinner phrase, status only |
| `tool.generating` | `{name}` | model is writing tool arguments |
| `tool.start` | `{tool_id, name, context, args}` | tool running |
| `tool.complete` | `{tool_id, name, duration_s, result, summary, inline_diff, todos}` | tool done |
| `message.delta` | `{text}` | streamed reply text |
| `message.interim` | `{text}` | commentary sealed as its own bubble |
| `session.usage` | `{usage}` | tokens, context, cost |
| `message.complete` | `{text, usage, status, error, ...}` | turn ended |

Server requests during a turn: `approval` → `{choice}`; `clarify` → `{answers:{qid:answer}}`;
`sudo`, `secret`, `vault.code`, `vault.unlock_prompt`, `vault.save_login` → `{value}`.
Desktop-window bridges (`preview.*`, `terminal.read`, `window.read`, `tour`) are declined
with error `4404`.

## Attachments and voice

- Images: `image.attach_bytes {session_id, content_base64, filename}` before `prompt.submit`.
- Other files: `file.attach {session_id, name, data_url}` → put `ref_text` at the top of the prompt.
- PDFs: `pdf.attach {session_id, content_base64, filename}` renders pages as images.
- Speech to text: record on the phone, `POST /api/audio/transcribe {data_url, mime_type}`.
- Text to speech: `POST /api/audio/speak {text}` → `{data_url}` played on the phone.
