# Hermes for Android

<p align="center"><img src="assets/icon.png" width="96" alt="Hermes icon"></p>

A native Android app for [Hermes Agent](https://github.com/NousResearch/hermes-agent), the self-improving AI agent by Nous Research. It is a full remote control for a Hermes backend: chat with live tool output, approve commands, manage skills, memory, models, MCP servers, scheduled jobs, messaging platforms, files and the rest of the agent from your phone.

Built with React Native (Expo SDK 57). English and Turkish UI.

**[Download the latest APK](https://github.com/azygoss/hermes-android/releases/latest)**

> This is an independent client. It talks to the same `hermes serve` backend that Hermes Desktop and the web dashboard use, over the same protocol. It is not affiliated with Nous Research.

## How it works

The agent keeps running on your computer or server. The phone connects to it:

```
Android app ──WebSocket JSON-RPC (/api/ws)──▶ hermes serve ──▶ agent, tools, memory, skills, sessions
            └─REST (/api/*)──────────────────▶               ──▶ files, config, cron, messaging, logs…
```

Nothing agent-related runs on the phone, so tools, terminal commands and file edits happen on the Hermes host. See [docs/PROTOCOL.md](docs/PROTOCOL.md) for the wire details and [docs/FEATURES.md](docs/FEATURES.md) for what maps to what.

## Set up the backend

Install Hermes on the machine that should do the work ([install guide](https://hermes-agent.nousresearch.com/docs/getting-started/installation)), then pick one of these.

### Over Wi-Fi, Tailscale or the internet (password login)

Hermes requires a login whenever it listens on anything other than localhost. Add one to `~/.hermes/config.yaml`:

```yaml
dashboard:
  basic_auth:
    username: me
    password: choose-a-strong-password
    secret: some-long-random-string   # keeps you signed in across restarts
```

```bash
hermes serve --host 0.0.0.0          # listens on port 9119
```

In the app, enter `http://<machine-ip>:9119`, tap **Check connection**, then sign in. Put it behind HTTPS (a reverse proxy or `tailscale serve`) if it is reachable from the internet.

### Through a tunnel, or Hermes in Termux on the same phone (token)

Token mode only accepts local connections. Fix the token so it survives restarts:

```bash
HERMES_DASHBOARD_SESSION_TOKEN=$(openssl rand -hex 24) hermes serve
```

Then either forward the port (`ssh -L 9119:127.0.0.1:9119 you@host` from an SSH app) or run Hermes in Termux, and connect the app to `http://127.0.0.1:9119` with that token.

### Connect with a QR code

Encode a link and scan it from the connect screen:

```bash
qrencode -t ansiutf8 "hermes://connect?url=http://192.168.1.20:9119&name=Home"
qrencode -t ansiutf8 "hermes://connect?url=http://127.0.0.1:9119&token=$HERMES_DASHBOARD_SESSION_TOKEN"
```

## Features

- **Chat** with streaming replies, reasoning, tool cards (terminal output, diffs, todos, images), markdown and code blocks with copy.
- **Agent requests**: approve or deny dangerous commands, answer clarify questions, enter sudo passwords, secrets and vault codes, and approve connector/MCP/plugin installs the agent asks for.
- **Composer**: slash-command and `@file` completion, photo/camera/PDF/file attachments, voice input (transcribed by the backend), image generation, `!command` shell, steer or interrupt-and-redirect a running turn, edit and resend.
- **Per-chat controls**: model and reasoning pickers, fast mode, YOLO, approval mode, personality, working directory, rename, retry, undo, branch, compress, `/btw` side questions, background tasks, export, hand off to Telegram/Discord, usage and context breakdown, subagents and processes, goals/loops/heartbeats, checkpoints and rollback.
- **Sessions**: search across every platform's history, pin, archive, hide, branch, delete, import Claude Code and Codex sessions.
- **Agent**: profiles (SOUL.md, model, avatar, skills, toolsets, MCP), main/auxiliary models and Mixture of Agents, memory notebooks and providers, learning journey, skills and the Skills Hub, toolsets with provider keys, MCP servers (catalog, OAuth, keys, tests), plugins, connectors, projects, credential vault, pets.
- **Automate**: cron jobs and blueprints, kanban board, group rooms with several profiles, background agents, messaging platforms with guided Telegram/WhatsApp setup, pairing approvals, webhooks.
- **Backend**: file browser with preview, upload and download, analytics, live logs, API keys, OAuth accounts and key pools, config (summary, form, raw YAML), system health (doctor, security audit, backups, updates, curator, hooks, CDP browser), Hermes CLI console, bot screen viewer, plan and credits.
- **App**: multiple backends, profile switching, dark/light themes with accent colours or the backend's skin, text size, read-aloud with backend or on-device TTS, notifications when a turn finishes or needs you in the background.

## Build from source

Requirements: Node 22+, JDK 17, Android SDK (platform 36, NDK 27).

```bash
npm install
npm run typecheck
npx expo start                      # dev server (Expo Go cannot load the native modules; use a dev build)
bash scripts/build-apk.sh           # release APK in dist/, debug-signed
HERMES_KEYSTORE=/path/release.keystore HERMES_KEYSTORE_PASSWORD=… bash scripts/build-apk.sh   # signed
```

Tagging `v*` builds and publishes the APK through GitHub Actions (`HERMES_KEYSTORE_B64` and `HERMES_KEYSTORE_PASSWORD` secrets sign it).

### Developing against a fake model

`scripts/dev-backend.sh start` runs `hermes serve` wired to `scripts/mock-llm.py`, an OpenAI-compatible stub that streams markdown and triggers real tools from keywords (`#tool`, `#danger` for an approval, `#clarify`, `#remember`, `#skill`). Useful for exercising every chat path without an API key.

## Project layout

```
src/app/              screens (expo-router): tabs, chat, sessions, every feature page
src/components/       UI primitives, chat pieces (messages, tool cards, composer, request cards)
src/lib/gateway/      JSON-RPC WebSocket client and the generated wire contract
src/lib/              auth, REST client, chat history folding, voice, formatting
src/store/            chat state (event reducer), connections, settings
src/i18n/             English source strings and the Turkish catalog
plugins/              Expo config plugin for release signing
scripts/              APK build, contract sync, string extraction, dev backend + mock LLM
```

## License

MIT
