# AGENTS.md — rules for every coding agent in this repo

Read this file fully before any change. Muse Code loads it automatically as project rules; other agents (Cursor, Claude Code, Codex…) must read it too. Product docs live in `docs/` (`01-PLAN.md` … `07-RISKS.md`). **`docs/02-PRD.md` is the scope. Do not build anything that is not in it** without the owner's explicit OK; propose it in the PR description instead.

## Project in one line
Daleel: a Next.js web app where a competitive programmer submits a Codeforces/AtCoder problem + their code; Meta's Muse Spark diagnoses the bug, a sandbox verifies a failing input, and a 4-level hint ladder (Egyptian Arabic or English) teaches the fix without spoilers. Coaches get weekly weak-topic reports.

## Stack (fixed — do not swap without approval)
- Next.js 15 App Router, TypeScript `strict`, React Server Components where natural; API = Route Handlers in `app/api/**/route.ts`.
- Tailwind CSS (logical properties only: `ms-/me-/ps-/pe-/start-/end-`, never `ml-/mr-/pl-/pr-/left-/right-`), CodeMirror 6, framer-motion, next-intl, react-markdown.
- zod v4 for every schema (LLM output, API bodies, DB JSON columns). JSON Schema for `response_format` is generated from zod, never hand-duplicated.
- Drizzle ORM + `@libsql/client` (SQLite file locally, Turso in prod). Migrations via drizzle-kit only.
- `openai` npm SDK with `baseURL = process.env.MODEL_API_BASE_URL` (default `https://api.meta.ai/v1`). Only `src/llm/meta-client.ts` may import `openai`.
- Vitest (unit/route), Testing Library (components), Playwright (e2e smoke). Package manager: pnpm only.

## Layout
`app/` routes · `src/domain/` pure logic (no IO) · `src/llm/` client, prompts, schemas, replay · `src/judges/` CF/AtCoder · `src/runner/` code execution · `src/services/` orchestration · `src/db/` schema/migrations/seed · `messages/` i18n · `tests/` mirrors `src/` with `fixtures/` · `docs/` product docs.

## Workflow (every task)
1. Pick ONE PR-sized task from `docs/05-BUILD-PLAN.md` (or the issue you were given). One behaviour per PR, ≤ ~400 changed lines.
2. **TDD (red → green → refactor).** Write the failing test first and run it; confirm it fails for the right reason. Then minimal code. Then refactor while green. Bug fix = first a test that reproduces the bug.
3. Mock only true boundaries: Meta API, Judge0/runner, codeforces.com/atcoder.jp, clock, randomness. Use recorded fixtures in `tests/fixtures/`. **No real network in `pnpm test`.** Live checks live in `pnpm smoke:*` and `pnpm eval` only.
4. **Verification before completion.** Before saying "done", run fresh and read the output: `pnpm lint && pnpm typecheck && pnpm test` (+ the PR's verify step from the build plan). Paste the summary lines in the PR description. Never claim a pass you did not see.
5. Commit messages: Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`). Branch `feat/<pr-id>-<slug>`. Do not put personal real names in commits, code, docs, or seed data; use handles.
6. Update `docs/05-BUILD-PLAN.md` checkboxes and `docs/VERIFIED.md` (facts you confirmed about external APIs) in the same PR.

## Secrets and env
- Never commit secrets. `.env.local` is git-ignored; `.env.example` lists every variable with no real values. Adding a variable = add it to `.env.example` + `src/env.ts` (zod-validated, fails fast at boot).
- Server-only secrets never get the `NEXT_PUBLIC_` prefix; never pass them to client components; never put them in prompts, logs, error messages, fixtures, or screenshots.
- Muse Code itself reads `META_API_KEY` from your shell; the app reads `MODEL_API_KEY`. Do not mix them up in code.

## LLM rules
- All model calls go through `callStructured()` in `src/llm/meta-client.ts` (budget guard, retries, zod validation, usage logging, replay). No direct `fetch` to the Meta API anywhere else.
- Model ids and reasoning effort come from env (`MODEL_*`, `EFFORT_*`), never hard-coded in services.
- Use role `developer` for instructions. Keep `temperature`/`top_p` unset. Never send `stop`, `n>1`, `logit_bias`, `logprobs`, `frequency_penalty`, `presence_penalty` (Meta returns 400).
- Message order: static developer rules → problem block → user attempt block (prompt-cache friendly). Untrusted text always inside tags (`<problem>`, `<student_code>`, …).
- Prompts and schemas must match `docs/04-PROMPTS.md`. If you change one, update the doc in the same PR and re-run `pnpm eval`, pasting the score.
- The product never shows a full solution. Hint levels 1–3 must pass `ladder-validator`. `brute_code` is never sent to the client.

## Code execution rules
- User code runs **only** through `src/runner/*` (Judge0 or the local docker provider). Never `child_process` user code in the web server. The docker provider must throw when `NODE_ENV=production`.
- Limits: 2 s CPU, 256 MB, no network, ≤ 12 tests, output capped at 64 KB.

## i18n and RTL rules
- Every user-visible string is in `messages/en.json` and `messages/ar.json` (a test fails on missing keys). No hard-coded UI text.
- `<html lang dir>` comes from the locale; Arabic = `rtl`. Code, statements, inputs/outputs, arrays in the walkthrough are always `dir="ltr"`; inline code uses `<code dir="ltr">` with `unicode-bidi: isolate`.
- Arabic copy (UI and prompts' STYLE_AR): Egyptian colloquial, technical terms in English, each line starts with an Arabic word, no parentheses/slashes/arrows around English terms.

## Quality bar
- TypeScript: no `any` (use `unknown` + zod), no `@ts-ignore`. ESLint clean. No unused exports.
- Errors: API routes return `{error:{code,message}}` with the right status; log with `requestId`; never leak stack traces or keys.
- Accessibility: buttons are `<button>`, labels on inputs, keyboard support for the walkthrough player.
- Performance: no blocking work in render; the CF API limiter (1 call / 2 s) is global.

## Do not
- Add dependencies without a one-line justification in the PR. No UI kits, no state libraries, no ORMs besides Drizzle.
- Add auth providers, payments, analytics, telemetry, or new judges.
- Touch `docs/01-PLAN.md` scope sections or the Not Doing list.
- Disable tests or lint rules to make CI green.
