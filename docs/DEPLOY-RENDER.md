# Optional hosted trial on Render (free)

Not required for judging (see D4). This gives a normal public URL for hands-on trials.

1. Sign in to <https://render.com> with GitHub. For a private repo, allow Render's GitHub App access to this repository.
2. Open `https://render.com/deploy?repo=https://github.com/<owner>/<repo>` (or Dashboard → **New → Blueprint** → pick the repo). Render reads `render.yaml`.
3. Paste `MODEL_API_KEY` when prompted (`sync: false`). `SESSION_SECRET` is generated. `DAILY_BUDGET_USD=2` caps live Meta spend per UTC day.
4. Apply. The Docker build takes a few minutes; then open `https://<service>.onrender.com`.

How it runs (`Dockerfile`, `scripts/render-start.sh`):

- Node 20 slim + g++ + bubblewrap. `next build` runs with a throwaway build-only `SESSION_SECRET` (module-level env validation; not inlined into `.next`). The real secret is read at runtime.
- On every start: `RUNNER_PROVIDER=auto` runs `scripts/smoke-runner.ts` (compile, run, network blocked, TLE, MLE). Only if it fully passes is the local sandbox enabled; otherwise `none` (diagnosis and hints still work; counterexamples show **Not verified**). The choice is printed as `[start] runner: …` in the Render log, and `/api/health` reports `runner: ok|off`.
- Then migrate + seed (`--demo-team`, idempotent) into the ephemeral `file:/tmp/daleel/daleel.db`, and `next start -H 0.0.0.0 -p $PORT`.

Limits of the free plan: 512 MB RAM (`next start` measured ~220 MB RSS; a g++ compile adds roughly 100–200 MB, so heavy concurrent use could hit the limit), the service sleeps after ~15 min idle (first request ~30–60 s), and data resets on every deploy/restart. Identities are handle-only (demo design), so anyone with the URL can use the app and spend up to the daily budget.
