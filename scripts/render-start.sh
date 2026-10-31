#!/bin/sh
# Container start: pick the runner, migrate + seed (idempotent), then serve on $PORT.
set -e
cd "$(dirname "$0")/.."
export NODE_ENV="${NODE_ENV:-production}"
export DATABASE_URL="${DATABASE_URL:-file:/tmp/daleel/daleel.db}"
PORT="${PORT:-10000}"

# RUNNER_PROVIDER=auto (or unset): enable the local sandbox only if the full runner smoke
# test passes here (compile, run, no network, time/memory limits). Otherwise use "none":
# diagnosis and hints still work, counterexamples show "Not verified".
if [ -z "$RUNNER_PROVIDER" ] || [ "$RUNNER_PROVIDER" = "auto" ]; then
  if RUNNER_PROVIDER=local timeout 90s node_modules/.bin/tsx scripts/smoke-runner.ts >/tmp/daleel-runner-probe.log 2>&1; then
    export RUNNER_PROVIDER=local
  else
    export RUNNER_PROVIDER=none
  fi
fi
echo "[start] runner: $RUNNER_PROVIDER"

node_modules/.bin/tsx src/db/migrate.ts
node --import tsx src/db/seed.ts --demo-team
echo "[start] next start on 0.0.0.0:$PORT"
exec node_modules/.bin/next start -H 0.0.0.0 -p "$PORT"
