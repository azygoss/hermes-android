# Feature map

Where each Hermes capability lives in the app and which backend call drives it. "RPC" means a
`/api/ws` JSON-RPC method; paths starting with `/api/` are REST.

## Chat

| Hermes feature | In the app | Backend |
|---|---|---|
| Start, resume, switch chats | Chat tab, Sessions tab | `session.create`, `session.resume`, `session.activate`, `GET /api/sessions/{id}/messages` |
| Streaming replies, reasoning, tool activity | Transcript | events `message.*`, `reasoning.*`, `tool.*`, `thinking.delta`, `status.update` |
| Todo list | Tasks panel above the composer | event `todo.updated` |
| Dangerous-command approval | Approval card | server request `approval`, `approval.received` |
| Clarify questions | Question card (single/multi choice, free text) | server request `clarify` |
| sudo / secrets / vault codes / save login | Password card | server requests `sudo`, `secret`, `vault.*`, `display.install.sudo` |
| Connect a connector/MCP/plugin mid-turn | Connection card | events `connection.request/update`, `connection.respond` |
| Send, queue, steer, redirect, interrupt | Composer (long-press send while busy), stop button | `prompt.submit`, `session.steer`, `session.redirect`, `session.interrupt` |
| Edit and resend from a message | Long-press your message | `prompt.submit` with `truncate_before_row_id` |
| Slash commands and skills | `/` completion, local handling for `/new /model /stop …` | `complete.slash`, `slash.exec`, `command.dispatch` |
| `@file` references | `@` completion | `complete.path` |
| Images, PDFs, files | Attach sheet | `image.attach_bytes`, `image.detach`, `pdf.attach`, `file.attach` |
| Voice input | Mic button | `POST /api/audio/transcribe` |
| Read replies aloud | Speaker button, auto-speak setting | `POST /api/audio/speak` or on-device TTS |
| Image generation | Attach sheet → Generate an image | `image.generate` |
| Shell commands | `!command` in the composer | `shell.exec` |
| Reactions | Thumbs up/down under a reply | `message.react` |
| Side questions, background tasks | Chat menu → /btw, /bg | `prompt.btw`, `prompt.background`, events `btw.complete`, `background.complete` |
| Model, reasoning, fast, YOLO, approvals, personality, cwd | Pills and chat menu | `config.set`, `model.options`, `session.cwd.set` |
| Provider keys from the picker | Model picker → Add key / Disconnect | `model.save_key`, `model.disconnect` |
| Rename, retry, undo, branch, compress | Chat menu | `session.title`, `/retry`, `session.undo`, `session.branch`, `session.compress` |
| Usage and context window | Chat menu → Usage & context | `session.usage`, `session.context_breakdown`, `usage.bars` |
| Subagents and background processes | Chat menu → Subagents & processes | `subagent.list/tail/steer/interrupt`, `process.list/kill/stop`, `delegation.*`, `spawn_tree.*` |
| Goals, loops, heartbeats | Chat menu → Goal, loop & heartbeat | `session.control.read`, `session.control`, `/goal`, `/loop`, `/heartbeat` |
| Checkpoints and rollback | Chat menu → Checkpoints | `rollback.list/diff/restore` |
| Export, save, hand off, archive, delete | Chat menu | `GET /api/sessions/{id}/export`, `session.save`, `handoff.request/state`, `PATCH`/`DELETE /api/sessions/{id}` |
| Workspace facts | Chat menu | `project.facts`, `verification.status` |
| Continue the last chat | Empty chat | `session.most_recent` |

## Sessions

Search, pin, archive, hide, branch, rename, delete, live badges, every source (CLI, desktop,
Telegram, cron…): `GET /api/sessions`, `/api/sessions/search`, `PATCH`/`DELETE /api/sessions/{id}`,
`session.branch_stored`, `session.set_hidden`. Claude Code / Codex import:
`session.foreign.list/preview/import`.

## Agent tab

| Feature | Backend |
|---|---|
| Profiles: list, create, switch on this phone, default, rename, delete, export, SOUL.md, description (auto-write), model, avatar, skills/toolsets/MCP per profile | `profiles.*`, `/api/profiles*` |
| Models: main, auxiliary tasks, Mixture of Agents presets | `/api/model/info`, `/api/model/options`, `/api/model/set`, `/api/model/auxiliary`, `/api/model/moa` |
| Memory: USER.md and MEMORY.md entries, edit/forget, providers (activate, configure, set up), resets | `/api/learning/graph`, `/api/learning/node`, `/api/memory*` |
| Learning journey timeline | `/api/learning/graph` |
| Skills: toggle, view/edit SKILL.md, create, rescan, Skills Hub search/preview/scan/install/uninstall/update | `/api/skills*`, `/api/skills/hub/*`, `skills.reload` |
| Toolsets: enable, provider choice, keys, post-setup | `/api/tools/toolsets*` |
| MCP servers: status, enable, test, OAuth, API keys, catalog, custom, reload | `mcp.*`, `reload.mcp`, `PUT /api/mcp/servers/{name}/enabled` |
| Plugins: toggle, settings, update (capability consent), remove, install from catalog or Git, rescan | `plugins.manage`, `/api/dashboard/plugins/*` |
| Connectors (Nous Portal) | `connectors.catalog/accounts/connect/operation.*` |
| Projects: create, activate, folders, primary, edit, archive, delete, recent chats | `projects.*` |
| Credential vault: sources, lock/unlock, add/remove logins, cards, addresses | `vault.*` |
| Pets | `pet.gallery/select/thumb/disable` |

## Automate tab

| Feature | Backend |
|---|---|
| Cron jobs: create, edit, pause/resume, run now, delete, run history (opens the run as a chat), delivery targets, skills, model, script-only | `/api/cron/jobs*`, `/api/cron/delivery-targets` |
| Automation blueprints | `/api/cron/blueprints*` |
| Kanban: boards, columns, create, move, assign, comment, dispatch, reclaim, archive, delete | `/api/plugins/kanban/*` |
| Group rooms with several profiles | `groups.list/create/state/log/send/stop/disband` |
| Background agents | `agents.list`, `delegation.status`, `session.active_list`, kanban workers |
| Messaging platforms: gateway start/stop/restart, credentials, test, Telegram bot wizard, WhatsApp linking | `/api/gateway/*`, `/api/messaging/*` |
| Pairing approvals | `/api/pairing*` |
| Webhooks | `/api/webhooks*` |

## More tab

| Feature | Backend |
|---|---|
| Files: browse, preview text/markdown/images, upload, mkdir, delete, download/share, ask Hermes about a file | `/api/files*` |
| Analytics | `/api/analytics/usage` |
| Logs (agent, errors, gateway) with level and text filters | `/api/logs` |
| API keys, OAuth accounts (device code and PKCE), credential pools | `/api/env*`, `/api/providers/oauth*`, `/api/credentials/pool*` |
| Configuration: summary, schema form, raw YAML | `config.show`, `/api/config*` |
| System: stats, battery, updates, doctor, security audit, prompt size, config migration, dump, debug report, backups, curator, checkpoints, session cleanup, hooks, reload .env, provider check, CDP browser | `/api/system/stats`, `/api/hermes/update*`, `/api/ops/*`, `/api/actions/*`, `/api/curator*`, `reload.env`, `setup.*`, `browser.manage`, `system.battery` |
| Hermes CLI console | `cli.exec` |
| Bot screen (computer-use desktop) | `display.status/start/stop/install/thumbnail` |
| Plan, credits and free tier | `billing.state`, `subscription.state`, `usage.bars`, `free_tier.*` |
| Plan limits per signed-in provider | `model.options` (signed-in providers), then `cli.exec` → `hermes usage --provider <slug> --json` |

## Not exposed, and why

- **Desktop window bridges** (`preview.*`, `terminal.read`, `window.read`, `tour`, `layout.apply`, `pane.reveal`): they drive panes the phone does not have, so the app declines them and the agent falls back.
- **Interactive bot-screen control** (`display.observe`, `display.lease.*`): needs a VNC (RFB) client; the app shows a live thumbnail instead.
- **Wake word** (`wake.*`) and backend-microphone voice mode (`voice.record`, `voice.toggle`): need continuous audio streaming; the app records and transcribes per message instead.
- **Desktop plumbing**: `shared_metrics.*`, `bot_relay.*`, `browser.controller.*`, room replication (`groups.peer.*`, `groups.replicate/promote/demote`), `onboarding.*`, `i18n.*`, `terminal.resize`, `clipboard.paste`, `paste.collapse`, `input.detect_drop`.
- **Purchases** (`billing.charge`, `subscription.upgrade/change`): handled on Nous Portal, which the plan screen links to.
- **Pet generation** (`pet.generate/hatch`): image-model pipeline aimed at the desktop pet editor.
