# Daleel — Architecture

Legend: facts about external APIs carry a source number `[S#]` (list in §11). **[UNVERIFIED]** = not confirmed in docs or by a test; the builder must check it in the named PR.

## 1. Stack (decision + why)
| Layer | Choice | Why |
|---|---|---|
| App + backend | **Next.js 15 (App Router) + TypeScript**, API in Route Handlers (`app/api/**/route.ts`) | One repo, one deploy, one language. Agents know it well. Server code keeps the API key off the client. |
| UI | Tailwind CSS + a few headless components; **CodeMirror 6** (`@uiw/react-codemirror` + C++ mode) for code; `framer-motion` for the walkthrough player | Small, fast, RTL-friendly (`dir` + logical CSS props). |
| i18n | `next-intl` with `messages/ar.json` + `messages/en.json` | Simple, typed, supports RTL per locale. |
| LLM client | Official **`openai` npm SDK** pointed at `https://api.meta.ai/v1` | Meta Chat Completions is OpenAI-compatible; the docs show the `openai` TS SDK with that `baseURL` [S1][S2]. |
| Schemas | **zod** → JSON Schema (`z.toJSONSchema` in zod v4) for `response_format`, and zod to re-validate every response | One source of truth for prompts, DB JSON columns, API types. |
| DB | **SQLite via libSQL** (`@libsql/client`) + **Drizzle ORM** + drizzle-kit migrations. Local: `file:./data/daleel.db`. Prod: **Turso** (hosted libSQL) | Zero-ops locally, same code in prod, prebuilt binaries on Windows (no native build like better-sqlite3). |
| Code execution | `Runner` interface with providers: `judge0` (Judge0 CE on RapidAPI pay-per-use, or a self-hosted Judge0 URL), `docker` (local dev only), `none` | Public Piston is whitelist-only since Feb 15, 2026 [S12]; Judge0 CE is sandboxed and has a hosted API [S13][S14]. |
| Tests | **Vitest** (unit + route tests with fakes), **Playwright** (1–3 e2e smoke tests), `msw` or hand fakes for HTTP | Fast TDD loop. |
| Deploy | **Vercel** (Hobby) + Turso | Free tier; Fluid compute functions default and max to 300 s on Hobby [S16], enough for streaming LLM calls. Backup: run locally + a tunnel (see `07-RISKS.md`). |
| Builder agent | **Muse Code** (`muse`) reading `AGENTS.md` [S9][S10][S11] | Uses the same Meta credits and strengthens "Use of Meta AI tooling". Cursor/others work too. |

Node 20 LTS or newer. Package manager: `pnpm` (or `npm`; pick one in PR-01 and never mix).

## 2. Components
```
Browser (Next.js pages, RTL/LTR)
  │  fetch / SSE
  ▼
Next.js Route Handlers (server)
  ├─ ProblemService      — parse URL → JudgeAdapter (codeforces | atcoder | custom) → cache in DB
  ├─ ContestGuard        — CF contest.list (cached 10 min) → block running contests
  ├─ AttemptService      — create attempt, child attempts (re-check), solved/stuck
  ├─ Pipeline            — orchestrates the LLM steps (diagnose → stress → ladder → explain/trace)
  │    └─ MetaClient     — openai SDK @ api.meta.ai/v1; retries, budget guard, usage logging, replay
  ├─ Runner             — judge0 | docker | none (compile + run with limits)
  ├─ ReportService       — pure stats function + LLM narrative + CF candidates
  ├─ CfApi               — problemset.problems / contest.list / user.status with a 1 call per 2 s limiter [S17]
  └─ Repo (Drizzle)      — SQLite/libSQL
External: Meta Model API · Judge0 · codeforces.com · atcoder.jp · (stretch) Meta ASR
```
See `diagrams/architecture.html`.

### Folder layout (create in PR-01)
```
app/                     # routes (pages + api)
  [locale]/...           # localized pages
  api/...                # route handlers
src/
  domain/                # pure types + functions (stats, ladder rules, validators) — no IO
  llm/                   # meta-client.ts, prompts/*.ts, schemas/*.ts, replay/
  judges/                # codeforces.ts, atcoder.ts, parse-*.ts, fixtures in tests
  runner/                # runner.ts (interface), judge0.ts, docker.ts, none.ts
  db/                    # schema.ts, client.ts, migrations/, seed.ts
  services/              # problem, attempt, pipeline, report
messages/ar.json, en.json
tests/                   # mirrors src/; fixtures/ (HTML pages, LLM responses)
docs/                    # this pack
```

## 3. Data model (SQLite / Drizzle)
All ids are `text` (ULID). Timestamps are `integer` unix ms (UTC). JSON columns are `text` validated by zod on read/write. See `diagrams/erd.html`.

| Table | Columns |
|---|---|
| `users` | `id` PK, `handle` UNIQUE, `role` (`student`\|`coach`), `locale` (`ar-EG`\|`en`), `cf_handle` NULL, `is_guest` int, `created_at` |
| `teams` | `id` PK, `name`, `coach_id` FK→users.id, `invite_code` UNIQUE (6 chars), `created_at` |
| `team_members` | `team_id` FK→teams.id, `user_id` FK→users.id, `joined_at`; PK(`team_id`,`user_id`) |
| `problems` | `id` PK, `judge` (`codeforces`\|`atcoder`\|`custom`), `external_id` (e.g. `4A`, `abc300_a`), `url` NULL, `title`, `statement_md`, `input_spec_md`, `output_spec_md`, `notes_md` NULL, `samples_json` (`[{input,output}]`), `time_limit_ms`, `memory_limit_mb`, `rating` NULL, `tags_json`, `contest_id` NULL, `content_hash`, `fetched_at`; UNIQUE(`judge`,`external_id`) |
| `attempts` | `id` PK, `user_id` FK, `problem_id` FK, `parent_attempt_id` FK→attempts.id NULL, `language` (`cpp17`\|`python3`), `code`, `code_hash`, `verdict_reported` NULL, `verdict_test_no` NULL, `student_note` NULL, `locale`, `status` (`new`\|`diagnosing`\|`diagnosed`\|`error`\|`solved`\|`stuck`), `max_hint_level` int default 0, `solved_at` NULL, `created_at` |
| `diagnoses` | `id` PK, `attempt_id` FK UNIQUE, `result_json` (DiagnosisSchema), `bug_class`, `topics_json`, `confidence` real, `model`, `reasoning_effort`, `created_at` |
| `stress_runs` | `id` PK, `attempt_id` FK UNIQUE, `status` (`verified`\|`no_mismatch`\|`brute_untrusted`\|`compile_error`\|`skipped`\|`error`), `runner`, `brute_code` NULL, `tests_json`, `failing_input` NULL, `expected_output` NULL, `actual_output` NULL, `compile_output` NULL, `created_at` |
| `hint_ladders` | `id` PK, `attempt_id` FK, `locale`, `levels_json` (4 levels), `created_at`; UNIQUE(`attempt_id`,`locale`) |
| `hint_reveals` | `attempt_id` FK, `level` int 1–4, `revealed_at`; PK(`attempt_id`,`level`) |
| `walkthroughs` | `id` PK, `attempt_id` FK, `locale`, `explanation_json`, `trace_json`, `created_at`; UNIQUE(`attempt_id`,`locale`) |
| `weekly_reports` | `id` PK, `team_id` FK, `week_start` (`YYYY-MM-DD`, Monday, Cairo), `locale`, `stats_json`, `report_json`, `created_at`; UNIQUE(`team_id`,`week_start`,`locale`) |
| `llm_calls` | `id` PK, `step` (`normalize`\|`diagnose`\|`stress`\|`ladder`\|`explain`\|`report`\|`asr`), `attempt_id` NULL FK, `model`, `request_hash`, `status` (`ok`\|`error`\|`replay`), `http_status` NULL, `input_tokens`, `output_tokens`, `cached_tokens`, `reasoning_tokens` (added in PR-03; Muse Spark reports it, see VERIFIED.md), `cost_usd` real, `latency_ms`, `error` NULL, `created_at` |

SQLite needs `PRAGMA foreign_keys = ON` per connection: call `connect(db)` (or `migrateDb`) from `src/db/client.ts` before queries. Local default `file:./data/daleel.db` (`pnpm db:migrate && pnpm db:seed`); Turso optional per DECISIONS D4.

Indexes: `attempts(user_id, created_at)`, `attempts(problem_id, code_hash, locale)`, `llm_calls(created_at)`, `team_members(user_id)`.

## 4. API routes (request/response shapes)
All bodies are JSON; errors use `{ "error": { "code": string, "message": string } }` with the HTTP status. Auth = signed httpOnly cookie `daleel_session` (`{userId}` HMAC with `SESSION_SECRET`).

| Method + path | Request | Response (200) | Errors |
|---|---|---|---|
| `POST /api/session` | `{ handle: string(3..24, [a-zA-Z0-9_-]), role: "student"\|"coach", inviteCode?: string, locale?: "ar-EG"\|"en" }` | `{ user: {id, handle, role, locale}, team?: {id,name} }` + cookie | 400 invalid, 404 invite code |
| `POST /api/session/demo` | `{}` | same as above (guest in team DEMO) | — |
| `POST /api/problems/resolve` | `{ url?: string, statement?: string }` (exactly one) | `{ problem: Problem }` | 400, 422 `unsupported_url`, 502 `fetch_failed` (UI shows paste box), 423 `contest_running` |
| `GET /api/problems/:id` | — | `{ problem: Problem }` | 404 |
| `POST /api/attempts` | `{ problemId, language: "cpp17"\|"python3", code: string(≤65536), verdictReported?: "WA"\|"TLE"\|"MLE"\|"RE"\|"CE"\|"NONE", verdictTestNo?: int, studentNote?: string(≤1000), parentAttemptId?: string }` | `{ attemptId }` | 400, 404 problem |
| `POST /api/attempts/:id/diagnose` | `{}`; `Accept: text/event-stream` | SSE events: `stage {name}` → `diagnosis {public: DiagnosisPublic}` → `stress {result: StressPublic}` → `ladder_ready {levels: 4}` → `done`; or `error {code,message}` | 409 already running, 423 contest_running, 503 `budget_reached` / `model_unavailable` |
| `GET /api/attempts/:id` | — | `{ attempt, problem, diagnosis?: DiagnosisPublic, stress?: StressPublic, revealedHints: Hint[], canExplain: boolean }` | 404 |
| `POST /api/attempts/:id/hints/next` | `{ locale? }` | `{ hint: { level: 1..4, title, body_md, question_back? }, remaining: int }` | 409 `no_more_hints`, 425 `not_diagnosed` |
| `POST /api/attempts/:id/stuck` | `{}` | `{ canExplain: true }` | — |
| `POST /api/attempts/:id/explain` | `{ locale? }` | `{ explanation: ExplanationPublic, trace: Trace }` | 403 `locked` (before level 3 / stuck) |
| `POST /api/attempts/:id/solved` | `{}` | `{ ok: true }` | — |
| `GET /api/me/attempts` | `?cursor` | `{ items: AttemptSummary[], nextCursor? }` | 401 |
| `POST /api/teams` | `{ name }` (coach) | `{ team: {id,name,inviteCode} }` | 403 not coach |
| `GET /api/teams/:id/stats?week=YYYY-MM-DD` | — | `{ stats: WeeklyStats }` | 403, 404 |
| `POST /api/teams/:id/report` | `{ week: "YYYY-MM-DD", locale, regenerate?: boolean }` | `{ report: WeeklyReport }` | 403, 503 |
| `GET /api/health` | — | `{ db: "ok", meta: "ok"\|"down"\|"unknown", runner: "ok"\|"off"\|"down", replay: boolean }` | — |
| `POST /api/voice/transcribe` (S) | multipart `audio` | `{ transcript }` | 413, 503 |

`DiagnosisPublic` = the diagnosis **without** `root_cause_internal`, `fix_internal`, `failing_line_internal`. `StressPublic` hides `brute_code` (never shown: it is a near-solution).

## 5. Meta Model API integration
### 5.1 Facts we rely on (verified in docs, Oct 27, 2026)
- Base URL `https://api.meta.ai/v1`; auth `Authorization: Bearer $MODEL_API_KEY` [S1][S3].
- `POST /v1/chat/completions` is OpenAI-compatible; response text at `choices[0].message.content`; `usage.{prompt_tokens,completion_tokens,total_tokens}` [S2].
- Models: `muse-spark-1.3` (recommended, 1,048,576-token context, text+image+video+audio+PDF in, text out), `muse-spark-1.2`, `muse-spark-1.1`; Contributor variants `muse-spark-1.3-contributor`, `muse-spark-1.2-contributor` (cheaper; content may be used for training); `muse-wonder-1.0` (preview, most capable) [S3].
- Muse Spark always reasons: `reasoning_effort` ∈ `minimal|low|medium|high|xhigh` (`"none"` → HTTP 400); 1.3 also supports `"max"` (not on the contributor variant) [S2][S3].
- Keep `temperature`/`top_p` at defaults (tuned for 1.0). `stop`, `n>1`, `logit_bias`, `logprobs`, `frequency_penalty`, `presence_penalty`, `web_search_options`, `modalities` are not supported → 400 [S2].
- Use the `developer` role for instructions (`system` accepted, same precedence) [S2].
- Structured output: `response_format: {type:"json_schema", json_schema:{name, schema, strict?}}`; decoding is constrained to the schema; recursive schemas → 400; nesting ≤ 10 levels; ≤ 5,000 properties; `strict:true` requires `additionalProperties:false` and all properties `required` [S4].
- Streaming via SSE (`stream:true`); **non-streaming requests that run too long return 504 `gateway_timeout`; streaming is exempt** [S2].
- `prompt_cache_key` + `prompt_cache_retention` (`in_memory`|`24h`); cached input is billed at the cached rate; check `cached_tokens` [S2][S5].
- `safety_identifier` (≤ 64 chars, hashed user id) recommended [S2].
- Pricing per 1M tokens: `muse-spark-*` Standard $1.25 in / $4.25 out / $0.15 cached; Contributor $0.10 / $0.20 / $0.002; `muse-wonder-1.0` $4 / $20 / $0.20 [S5].
- Rate limits per **team** (not per key): `muse-spark-1.3` 3,000 RPM / 4M TPM; contributor 150 RPM / 3M TPM (another page of the docs says 100 RPM — treat as 100) [S5][S6].
- 429 → exponential backoff with jitter starting ~500 ms, honour `Retry-After`; headers `x-ratelimit-remaining-{tokens,requests}` [S5].
- Tool calling, image understanding, Responses API (`/v1/responses`, keeps reasoning across turns) exist [S2][S7].
- Speech-to-text: `POST /v1/asr/transcribe` (multipart, WAV mono 16-bit 16/24 kHz, ≤ 10 min, ≤ 32 MB), model `muse-voice-transcribe-1.0`, **Arabic supported**, `languageBias` + `keywords`; $0.18/hour [S8].
- An account needs a payment method on file before any API call; $150 hackathon credits are applied to usage first; after that, usage is charged to the card [rules file, Credit Terms §1.2, §3.6].

### 5.2 Not verified — check in PR-02 smoke test
- **[VERIFIED 2026-10-29, see VERIFIED.md: yes, included]** Whether reasoning tokens are included in `usage.completion_tokens` (and billed as output). The smoke test logs `usage` for a high-effort call; the cost estimator uses `completion_tokens` as billed output either way.
- **[VERIFIED 2026-10-29, see VERIFIED.md: works, JSON text deltas]** Exact behaviour of `response_format` + `stream:true` together (expect JSON deltas). The pipeline does **not** depend on it: we stream progress *events* from our server and call the model non-streaming **only for short steps**; diagnose/explain use `stream:true` and accumulate text, then parse. If streaming + json_schema misbehaves, fall back to non-streaming with `reasoning_effort:"medium"`.
- **[UNVERIFIED]** Typical latency of `muse-spark-1.3` at `high` effort for ~4k-token prompts. Measure in PR-02 and PR-09; target p50 ≤ 25 s.
- **[UNVERIFIED]** Quality of Egyptian Arabic. Measured in PR-11 review.
- **[UNVERIFIED]** Whether the hackathon credits cover Muse Code pay-as-you-go usage (docs say Muse Code bills pay-as-you-go to the same account; credits apply to "Services") — check the Billing page after a first Muse Code session.

### 5.3 Client wrapper (`src/llm/meta-client.ts`)
```ts
export interface LlmStepConfig {
  step: 'normalize'|'diagnose'|'stress'|'ladder'|'explain'|'report';
  model: string;                       // from env, e.g. MODEL_DIAGNOSE
  reasoningEffort: 'minimal'|'low'|'medium'|'high'|'xhigh';
  maxCompletionTokens: number;
  stream: boolean;
  schemaName: string;
  schema: object;                      // JSON Schema generated from zod
}
export async function callStructured<T>(cfg: LlmStepConfig, messages: ChatMessage[],
  opts: { attemptId?: string; userId?: string; cacheKey?: string; zod: ZodType<T> }): Promise<T>
```
Behaviour (each line = a unit test):
1. Budget guard: if today's `sum(llm_calls.cost_usd)` ≥ `DAILY_BUDGET_USD` → throw `BudgetReached` (no network call).
2. Replay: if `DEMO_REPLAY=1` and a recorded response exists for `request_hash` → return it, log `status='replay'`.
3. Sends `model`, `messages`, `reasoning_effort`, `max_completion_tokens`, `response_format` (json_schema, `strict:true`), `prompt_cache_key` (= `problem:<problemId>`), `prompt_cache_retention:"24h"`, `safety_identifier` (= sha256(userId).slice(0,64)), `stream`.
4. Retries: 429/500/502/503/504 → up to 3 retries, backoff 0.5 s, 1 s, 2 s + jitter, honour `Retry-After`. 400 → no retry, log body.
5. Parses `content` with `JSON.parse` then zod; on failure → one repair retry with a `developer` message "Your previous output did not match the schema: <zod error>. Return only valid JSON." → else throw `SchemaError`.
6. Logs every call to `llm_calls` with tokens, `cached_tokens` (from `usage.prompt_tokens_details.cached_tokens` if present — **[UNVERIFIED] field path**, default 0), cost from the price table in `src/llm/pricing.ts`, latency.
7. Fallback provider: if `LLM_FALLBACK_BASE_URL` is set and Meta returns 5xx 3 times or is marked down by `/api/health`, retry once against the fallback with `LLM_FALLBACK_MODEL` (open-weight Muse Spark Open or Llama via an OpenAI-compatible host). The fallback may not support `json_schema`; then send `response_format:{type:"json_object"}` and rely on zod + repair.

### 5.4 Step configuration (defaults in `.env.example`)
| Step | Model | Effort | Max out tokens | Stream | When |
|---|---|---|---|---|---|
| normalize (paste/image → Problem) | `muse-spark-1.3` | low | 4,000 | no | paste or screenshot only |
| diagnose | `muse-spark-1.3` | high | 16,000 (`MAXTOK_DIAGNOSE`) | yes | every new attempt; budget includes reasoning tokens |
| stress (brute + tests) | `muse-spark-1.3` | medium | 16,000 (`MAXTOK_STRESS`, includes reasoning tokens) | yes | if runner ≠ none and diagnosis.bug_found |
| ladder (4 hints) | `muse-spark-1.3` | low | 8,000 (`MAXTOK_LADDER`, includes reasoning tokens) | no | after diagnose (+ stress result) |
| explain (+ trace) | `muse-spark-1.3` | medium | 16,000 (`MAXTOK_EXPLAIN`, includes reasoning tokens) | yes | on demand |
| report | `muse-spark-1.3` | medium | 4,000 | no | coach button |

## 6. Prompt pipeline
```
Problem (cached) + Code + verdict + note
   │
   ├─(1) DIAGNOSE ──► Diagnosis {bug_found, bug_class, lines, topics, approach, suspect_inputs, *_internal}
   │                     │
   │                     ├─(2) STRESS (if runner on) ──► model: brute.cpp + tests
   │                     │        └─ Runner: brute on samples (trust gate) → both on tests → first mismatch
   │                     │                 └─► StressRun {verified | no_mismatch | brute_untrusted | compile_error}
   │                     ▼
   ├─(3) LADDER (diagnosis + stress result + locale) ──► 4 levels → validator (no code in 1–3, no leak)
   │
   └─(4) EXPLAIN on demand (diagnosis + failing input + code) ──► explanation + corrected own lines + Trace frames
```
Rules:
- Message order for cache hits: `developer` (static rules) → `developer` (problem block, identical for every attempt on the problem) → `user` (code + verdict + note). Static prefix first maximises prompt-cache reuse [S5].
- Each step receives only what it needs (smaller prompts, fewer leaks). The ladder never sees `brute_code`.
- If `confidence < 0.4` and no verified counterexample, the ladder is generated in "uncertain" mode (hints phrased as checks: "test your code on the smallest input").
- If the stress step finds a mismatch that contradicts the diagnosis (different failing area), re-run diagnose once with the verified failing input appended ("ground truth: your code outputs X, expected Y on input Z"). This "self-correction with execution feedback" is a key technical-depth point for the video.

## 7. Language handling (Egyptian Arabic RTL + English)
- Locales: `ar-EG` (default for Arabic browsers) and `en`. `<html lang dir>` set per locale in `app/[locale]/layout.tsx`.
- Use CSS logical properties (`ms-`, `me-`, `ps-`, `pe-` in Tailwind) everywhere; never `ml-`/`mr-` (lint rule or grep check in CI).
- Markdown renderer (`react-markdown`): every inline `code` → `<code dir="ltr" class="bidi-isolate">`; fenced code → `<pre dir="ltr">`; paragraphs get `dir="auto"`. CSS: `.bidi-isolate{unicode-bidi:isolate}`.
- Prompt rules for Arabic output (in `04-PROMPTS.md`): Egyptian colloquial, technical terms in English, every line/bullet starts with an Arabic word, no parentheses/arrows/slashes around English terms, numbers next to Arabic words, code only in backticks or blocks.
- Problem statements are kept in their original language (English for CF/AtCoder) and rendered LTR.
- Fonts (D16): self-hosted variable `Readex Pro` 300–700 for both UI scripts and `JetBrains Mono` 400–700 for code, with per-subset unicode ranges and OFL licenses.

## 8. Caching and cost control
| Cache | Key | TTL |
|---|---|---|
| Problem | (`judge`, `external_id`) | forever (refresh manually) |
| CF `problemset.problems` | global | 24 h (stored as a file/DB blob) |
| CF `contest.list` | global | 10 min |
| Diagnosis + stress + ladder | (`problem_id`, `code_hash`, `locale`) | 24 h (reuse rows from an identical attempt) |
| Explain/trace | (`attempt_id`, `locale`) | forever |
| Weekly report | (`team_id`, `week_start`, `locale`) | until regenerate |
| Meta prompt cache | `prompt_cache_key = problem:<id>` + `prompt_cache_retention: 24h` | server-managed [S2] |

Cost estimate per attempt (Standard mode, prices [S5]; token counts are **estimates** until PR-09 measures them):
| Step | In tokens | Out tokens | Cost |
|---|---|---|---|
| diagnose | 4,000 | 3,000 | $0.018 |
| stress | 4,500 | 2,500 | $0.016 |
| ladder | 2,500 | 1,200 | $0.008 |
| explain (≈50% of attempts) | 4,500 | 3,500 | $0.021 × 0.5 = $0.010 |
| **Total** | | | **≈ $0.05** → $150 ≈ 3,000 attempts |

Guards: `DAILY_BUDGET_USD` (default 10), per-user limit `MAX_ATTEMPTS_PER_USER_PER_DAY` (default 30), max code size 64 KB, problem statement truncated to 12k chars. Development traffic may use `muse-spark-1.3-contributor` (≈12x cheaper) via env if the owner agrees (Open Question 5).

## 9. Error handling
| Failure | Behaviour |
|---|---|
| Meta 429 | backoff + retry ×3; then SSE `error {code:"rate_limited"}` → UI "Busy, retrying in a moment" + Retry button |
| Meta 5xx / 504 / network | retry ×3 → fallback provider if configured → replay (demo mode) → error card |
| Meta 400 | no retry; log body to `llm_calls.error`; error card "Something went wrong on our side" |
| Schema mismatch | one repair retry → `SchemaError` → error card |
| Budget reached | 503 `budget_reached`, UI explains politely |
| CF/AtCoder fetch 403/timeout | 502 `fetch_failed` → paste box |
| Runner down / quota | stress status `error`; diagnosis still shown with "not verified" badge |
| Student CE | stress status `compile_error`, compiler output shown, ladder generated in CE mode |
| DB error | 500 with request id; never leak stack traces |
All server errors are logged with a `requestId` (header `x-request-id`).

## 10. Security
- **Secrets:** only in env (`.env.local` locally, Vercel env in prod). Never in the repo, logs, client bundles, or LLM prompts. `MODEL_API_KEY` is server-only (no `NEXT_PUBLIC_` prefix).
- **Running untrusted code:** never on the web server process. Only via the `Runner`:
  - `judge0`: Judge0 CE runs each submission in an isolated, resource-limited sandbox [S13][S14]. We send `cpu_time_limit=2`, `wall_time_limit=5`, `memory_limit=262144` (KB), `enable_network=false` **[UNVERIFIED field names on the hosted plan — check `GET /config_info` / docs in PR-13]**, `language_id` for C++17 GCC looked up via `GET /languages` at startup (do not hard-code).
  - `docker` (local dev only): `docker run --rm --network none --memory 256m --cpus 1 --pids-limit 64 --read-only --tmpfs /w:rw,exec,size=64m -u 65534 gcc:13 sh -c 'g++ -O2 -std=c++17 main.cpp -o a && timeout 2 ./a < in.txt'`. Refuse to start this provider when `NODE_ENV=production`.
  - Output capped at 64 KB per run; inputs ≤ 64 KB; ≤ 12 tests; ≤ 2 programs.
- **Prompt injection:** problem statements and student code are untrusted. They are wrapped in clearly delimited blocks (`<problem>…</problem>`, `<student_code>…</student_code>`) and the developer prompt says to treat them as data. Model output is never executed except the brute-force program, which goes only to the sandbox.
- **Auth:** signed cookie, `SameSite=Lax`, `HttpOnly`, `Secure` in prod; coach routes check team ownership; rate limit per IP on `/api/session` and `/api/attempts`.
- **Privacy:** no real names; handles only; `safety_identifier` is a hash; no third-party analytics.
- **Scraping etiquette:** browser-like `User-Agent`, 1 request / 2 s to CF API, cache everything, only fetch when a user asks.

## 11. Sources (checked Oct 27, 2026)
- [S1] Meta Model API overview — https://dev.meta.ai/docs/overview
- [S2] Chat completion guide (parameters, streaming, 504 note, compat table) — https://dev.meta.ai/docs/protocols/chat-completions ; API reference — https://ai.developer.meta.com/docs/api-reference/chat-completions/create-chat-completion
- [S3] Models — https://dev.meta.ai/docs/models
- [S4] Structured output — https://dev.meta.ai/docs/features/structured-output
- [S5] Pricing and rate limits — https://dev.meta.ai/docs/pricing-rate-limits
- [S6] Pricing page (older copy, contributor 100 RPM) — https://ai.developer.meta.com/docs/pricing-rate-limits/
- [S7] SDKs and libraries (structured output, tool calling, streaming, files) — https://dev.meta.ai/docs/sdks
- [S8] Speech to text (Muse Voice Transcribe) — https://dev.meta.ai/docs/speech-to-text
- [S9] Muse Code — https://dev.meta.ai/docs/muse-code
- [S10] Muse Code auth (`META_API_KEY` for headless/CI) — https://dev.meta.ai/docs/muse-code/auth
- [S11] Muse Code configuration (`AGENTS.md` loaded as project rules) — https://dev.meta.ai/docs/muse-code/configuration
- [S12] Piston public API whitelist-only since Feb 15, 2026 — https://github.com/engineer-man/piston
- [S13] Judge0 CE API docs — https://ce.judge0.com/
- [S14] Judge0 CE on RapidAPI pricing (Basic: $0.0017 per submission) — https://rapidapi.com/judge0-official/api/judge0-ce/pricing
- [S15] Modal Sandboxes (alternative runner, gVisor) — https://modal.com/docs/guide/sandboxes
- [S16] Vercel function duration (Hobby default/max 300 s with Fluid compute) — https://vercel.com/docs/functions/configuring-functions/duration
- [S17] Codeforces API (1 call per 2 s; methods; contest phases) — https://codeforces.com/apiHelp , https://codeforces.com/apiHelp/methods , https://codeforces.com/apiHelp/objects
- [S18] AtCoder Problems dataset (problem list JSON) — https://kenkoooo.com/atcoder/resources/problems.json
- [S19] Muse Spark Open hosted providers — https://fireworks.ai/models/fireworks/muse-spark-open , https://www.together.ai/blog/meta-muse-spark-open
- Box test, Oct 27 2026: `GET codeforces.com/problemset/problem/4/A` and `/contest/4/problem/A` with a browser User-Agent → 200 (page contains `problem-statement` + `sample-test`); the same URLs with curl's default UA or UA `node` → 403. **Always send a browser-like User-Agent.** `atcoder.jp/contests/abc300/tasks/abc300_a` → 200 with `lang-en` and "Sample Input 1"; CF API `problemset.problems` and `user.status` → 200.
