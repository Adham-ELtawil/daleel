# Daleel

An AI training coach for Arab competitive programmers, built for the Meta Global AI Developer Hackathon.
A trainee submits a Codeforces/AtCoder problem and their C++ code; Meta's **Muse Spark** (Meta Model API) diagnoses the bug, a local sandbox verifies a failing input, and a 4-level hint ladder in Egyptian Arabic or English teaches the fix without spoilers. Coaches get weekly weak-topic reports.

> Status: **PR-01 scaffold.** The landing page and `GET /api/health` exist; features land PR by PR (see `docs/05-BUILD-PLAN.md`).

## Requirements

- Node.js 20+ and pnpm 10 (`corepack enable`)
- Later PRs: Docker (local code runner) and a Meta Model API key

## Setup

```bash
pnpm install
cp .env.example .env.local   # put your MODEL_API_KEY here; never commit it
pnpm dev                     # http://localhost:3000 and http://localhost:3000/api/health
```

## Scripts

| Command                             | What it does                                                        |
| ----------------------------------- | ------------------------------------------------------------------- |
| `pnpm dev`                          | Dev server                                                          |
| `pnpm build` / `pnpm start`         | Production build / serve                                            |
| `pnpm lint`                         | ESLint                                                              |
| `pnpm typecheck`                    | `tsc --noEmit` (strict)                                             |
| `pnpm test`                         | Vitest unit + route tests (no network)                              |
| `pnpm test:e2e`                     | Playwright smoke (run `pnpm exec playwright install chromium` once) |
| `pnpm format` / `pnpm format:check` | Prettier                                                            |

## Docs

Product and engineering docs are in [`docs/`](docs/README.md). Rules for coding agents: [`AGENTS.md`](AGENTS.md). Plan changes: [`docs/DECISIONS.md`](docs/DECISIONS.md).

## License

MIT, see [LICENSE](LICENSE).
