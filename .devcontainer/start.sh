#!/usr/bin/env bash
# Codespaces postStart: start Daleel on port 3000 in the background (log: /tmp/daleel.log).
set -uo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-3000}"
log() { echo "[daleel start] $*"; }

# Stop an older server on this port (e.g. after a rebuild).
PIDFILE=/tmp/daleel-next.pid
if [ -f "$PIDFILE" ]; then kill -- "-$(cat "$PIDFILE")" 2>/dev/null || true; rm -f "$PIDFILE"; fi

# Rebuild if the code changed since the last build (e.g. after git pull).
if [ ! -f .next/BUILD_ID ] || [ "$(cat .next/DALEEL_BUILT_COMMIT 2>/dev/null)" != "$(git rev-parse HEAD 2>/dev/null)" ]; then
  log "building"
  pnpm db:migrate >/dev/null && pnpm build >/tmp/daleel-build.log 2>&1 \
    && git rev-parse HEAD > .next/DALEEL_BUILT_COMMIT
fi

# No key -> recorded demo responses for the three demo examples (no live Meta calls).
if [ -z "${MODEL_API_KEY:-}" ]; then export DEMO_REPLAY=1; log "no MODEL_API_KEY: demo replay mode"; fi

# Enable the local C++ sandbox only if its smoke test passes here; otherwise "none".
if [ -z "${RUNNER_PROVIDER:-}" ] || [ "${RUNNER_PROVIDER}" = "auto" ]; then
  if RUNNER_PROVIDER=local timeout 90s node_modules/.bin/tsx scripts/smoke-runner.ts >/tmp/daleel-runner-probe.log 2>&1; then
    export RUNNER_PROVIDER=local
  else
    export RUNNER_PROVIDER=none
  fi
fi
log "runner: $RUNNER_PROVIDER"

export NODE_ENV=production
setsid nohup node_modules/.bin/next start -H 0.0.0.0 -p "$PORT" >/tmp/daleel.log 2>&1 </dev/null &
echo $! > "$PIDFILE"
log "starting on port $PORT (log: /tmp/daleel.log)"
