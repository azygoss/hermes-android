#!/usr/bin/env bash
# Start/stop a local Hermes backend wired to the mock LLM, for exercising the app.
#   HERMES_SRC=~/hermes-agent scripts/dev-backend.sh start|stop|status
# Token mode on 127.0.0.1:9119 with token "devtoken" unless HERMES_TOKEN is set.
set -euo pipefail

HERMES_SRC=${HERMES_SRC:-$HOME/dev/research/hermes-agent}
export HERMES_HOME=${HERMES_HOME:-$HOME/dev/research/hermes-home}
TOKEN=${HERMES_TOKEN:-devtoken}
PORT=${HERMES_PORT:-9119}
HOST=${HERMES_BIND:-127.0.0.1}
RUN=$HERMES_HOME/.dev-backend
mkdir -p "$RUN"
HERE=$(cd "$(dirname "$0")" && pwd)

stop() {
  for name in serve mock; do
    if [[ -f $RUN/$name.pid ]]; then
      kill "$(cat "$RUN/$name.pid")" 2>/dev/null || true
      rm -f "$RUN/$name.pid"
    fi
  done
  "$HERMES_SRC/.venv/bin/hermes" serve --stop >/dev/null 2>&1 || true
}

start() {
  stop
  if [[ ! -f $HERMES_HOME/config.yaml ]] || ! grep -q mock-model "$HERMES_HOME/config.yaml"; then
    cat >"$HERMES_HOME/config.yaml" <<EOF
model:
  provider: custom
  default: mock-model
  base_url: http://127.0.0.1:8999/v1
  api_key: mock
  api_mode: chat_completions
EOF
  fi
  nohup python3 "$HERE/mock-llm.py" >"$RUN/mock.log" 2>&1 &
  echo $! >"$RUN/mock.pid"
  HERMES_DASHBOARD_SESSION_TOKEN=$TOKEN nohup "$HERMES_SRC/.venv/bin/hermes" serve --skip-build --host "$HOST" --port "$PORT" >"$RUN/serve.log" 2>&1 &
  echo $! >"$RUN/serve.pid"
  for _ in $(seq 1 60); do
    curl -sf -m 2 "http://127.0.0.1:$PORT/api/health" >/dev/null && { echo "backend ready on $HOST:$PORT (token: $TOKEN)"; return; }
    sleep 1
  done
  echo "backend did not come up; see $RUN/serve.log" >&2
  exit 1
}

case ${1:-status} in
  start) start ;;
  stop) stop ;;
  status) curl -s -m 2 "http://127.0.0.1:$PORT/api/health" || echo "down" ;;
esac
