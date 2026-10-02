# Hermes plugins used by the app

## commandcode-usage

Hermes reports plan limits (`hermes usage`, `/usage`) for Codex, OpenCode Go, Anthropic and OpenRouter,
but not for Command Code. This plugin adds the Command Code 5-hour and weekly windows, the remaining
monthly credits and the plan renewal date, so they show up under **More → Plan limits** in the app.

It re-registers the bundled `commandcode` provider unchanged apart from that one hook.

```bash
mkdir -p ~/.hermes/plugins/model-providers
cp -r commandcode-usage ~/.hermes/plugins/model-providers/
hermes usage --provider commandcode   # check
```
