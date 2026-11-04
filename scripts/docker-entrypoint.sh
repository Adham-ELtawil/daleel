#!/bin/sh
# Container start: persistent session secret, migrations, demo seed, then the production server.
set -e
if [ -z "$SESSION_SECRET" ]; then
  if [ ! -s data/.session-secret ]; then
    node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > data/.session-secret
  fi
  SESSION_SECRET=$(cat data/.session-secret)
  export SESSION_SECRET
fi
pnpm -s db:migrate
pnpm -s db:seed --demo-team
if [ "$RUNNER_PROVIDER" = "local" ]; then
  pnpm -s smoke:runner || echo "WARNING: C++ sandbox unavailable (run the container with security_opt seccomp/apparmor unconfined, see README). Counterexamples will show 'Not verified'."
fi
echo "Daleel: DEMO_REPLAY=$DEMO_REPLAY RUNNER_PROVIDER=$RUNNER_PROVIDER -> http://localhost:${PORT:-3000}"
exec pnpm -s start -p "${PORT:-3000}" -H 0.0.0.0
