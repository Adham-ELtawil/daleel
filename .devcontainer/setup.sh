#!/usr/bin/env bash
# Codespaces postCreate: tools, deps, .env.local (no secrets printed), DB, production build.
set -euo pipefail
cd "$(dirname "$0")/.."
log() { echo "[daleel setup] $*"; }

# Optional runner tools (start.sh only enables the runner if its smoke test passes).
if ! command -v g++ >/dev/null || ! command -v bwrap >/dev/null; then
  if sudo -n true 2>/dev/null; then
    log "installing g++ + bubblewrap"
    sudo apt-get update -qq >/dev/null 2>&1 && sudo apt-get install -y -qq g++ bubblewrap >/dev/null 2>&1 \
      || log "apt install failed; runner will stay off"
  fi
fi

# pnpm (version pinned by package.json "packageManager").
if ! command -v pnpm >/dev/null; then
  sudo -n corepack enable 2>/dev/null || corepack enable 2>/dev/null || npm install -g pnpm@10.34.6 >/dev/null
fi

log "pnpm install"
pnpm install --frozen-lockfile

# .env.local: never contains MODEL_API_KEY (Codespaces injects it as an env var). Values are not echoed.
if [ ! -f .env.local ]; then
  cp .env.example .env.local
fi
node - <<'NODE'
const fs = require("node:fs");
const crypto = require("node:crypto");
let text = fs.readFileSync(".env.local", "utf8");
const set = (key, value) => {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  text = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
};
const current = (text.match(/^SESSION_SECRET=(.*)$/m) || [])[1] || "";
if ((process.env.SESSION_SECRET || current).length < 32)
  set("SESSION_SECRET", crypto.randomBytes(32).toString("hex"));
set("MODEL_API_KEY", "");
set("DAILY_BUDGET_USD", process.env.DAILY_BUDGET_USD || "2");
fs.writeFileSync(".env.local", text, { mode: 0o600 });
NODE
log ".env.local ready"

log "database: migrate + seed (demo team)"
pnpm db:migrate
pnpm db:seed --demo-team

log "production build"
pnpm build
git rev-parse HEAD > .next/DALEEL_BUILT_COMMIT 2>/dev/null || true
log "done"
