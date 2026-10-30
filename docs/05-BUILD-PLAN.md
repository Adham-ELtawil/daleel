# Daleel — Build plan (Oct 27 → Nov 5, 04:00 Cairo)

> Plan changes since this was written are in `DECISIONS.md` (solo, no paid services, no hosted deploy, fakes until the Meta key works).

Times are **Cairo time**. Deadline = **Thu Nov 5, 04:00 Cairo** (= Nov 4, 21:00 ET = Nov 5, 02:00 UTC). Note: per the tz database, Egypt's daylight-saving time ends at the end of Thu Oct 29, 2026 (Cairo goes from UTC+3 to UTC+2), so from Oct 30 Cairo = UTC+2; the 04:00 deadline already accounts for this. **Check your phone clock on Oct 30.**

**Internal target: submission complete by Wed Nov 4, 22:00 Cairo** (6 h buffer). The CV form allows "Update Project" before the deadline; changing the repository after the deadline marks the project late.

## Rules for every PR (from `AGENTS.md`)
- One PR = one behaviour, ≤ ~400 changed lines, its own tests. Branch `feat/<id>-<slug>`.
- TDD: write the failing test first (show it failing in the PR description), then the minimal code, then refactor.
- Verify before claiming done: `pnpm lint && pnpm typecheck && pnpm test` green (+ the PR's own verify step). Paste the output summary in the PR.
- LLM-dependent code is tested with recorded/fake responses; live calls only in `pnpm smoke:*` scripts.

## Milestones
| Milestone | When | Definition of done |
|---|---|---|
| **M0 Ready** | Tue Oct 27 night | Repo created, pack copied to `docs/`, credits checked, decisions in `01-PLAN.md` Open Questions answered. |
| **M1 Skeleton** | Wed Oct 28 night | App runs locally and on Vercel; CI green; `smoke:meta` passes against the real API (or the fallback). |
| **M2 Problem + attempt** | Thu Oct 29 night | Paste CF/AtCoder link → problem with samples; submit code → attempt row. |
| **M3 Diagnosis** | Fri Oct 30 night | Diagnose works end-to-end with SSE; eval harness runs; ≥ 6/10 on the eval set. |
| **M4 Hints + language** | Sat Oct 31 night | Hint ladder + re-check loop; Arabic/English with correct RTL. **First full trainee demo possible.** |
| **M5 Verified counterexample** | Sun Nov 1 night | Runner + stress step; eval ≥ 8/10 bug class, verified on CF 4A and 1A. |
| **M6 Walkthrough + coach** | Mon Nov 2 night | Trace player; teams; weekly report with real CF recommendations. |
| **M7 FEATURE FREEZE** | **Tue Nov 3, 23:59** | Contest guard, demo mode + replay, deployed, seeded. After this: bug fixes, copy, polish, video only. |
| **M8 Submitted** | Wed Nov 4, 22:00 | Video uploaded, README done, form submitted. |
| Buffer | Wed Nov 4 22:00 → Thu Nov 5 04:00 | Only emergencies; re-submit if needed. |

## Day 0 — Tue Oct 27 (today, owner, ~1 h)
- [x] Read `01-PLAN.md`; answer the Open Questions (name, team, builder agent, Judge0 card OK?, contributor mode for dev?).
- [ ] Check the Meta **Billing** page for the $150 credits (done: active); create an API key (blocked on Meta's side, see `DECISIONS.md` D7) (Model API dashboard) and keep it out of chat/screenshots.
- [ ] Screenshot the gated **Details** page (problem statements, schedule) and the submit form for the builder. (Repo/video/hosting questions answered by organizers in Discord, see `DECISIONS.md` D4.)
- [ ] Install Node 20+, pnpm, Git; optional: Docker Desktop (local runner), Muse Code (`irm https://dev.meta.ai/install.ps1 | iex` on Windows, then `muse --version`).

## Day 1 — Wed Oct 28 → M1
| PR | Goal | RED test first | Verify |
|---|---|---|---|
| **PR-01 scaffold** ✅ | Next.js 15 + TS strict + Tailwind + ESLint + Prettier + Vitest + Playwright; folder layout from `03-ARCHITECTURE.md` §2; `AGENTS.md`, `.env.example`, `docs/`; MIT `LICENSE`; GitHub Actions CI (`lint`, `typecheck`, `test`). | `tests/smoke.test.ts`: `GET /api/health` route handler returns `{db:"unknown"}` shape (fails: no route). | `pnpm dev` shows landing; CI green on the PR. |
| **PR-02 meta client** ✅ | `src/llm/meta-client.ts` per §5.3 (budget guard, retries, zod parse + repair retry, usage logging via an injected logger), `src/llm/pricing.ts`, script `pnpm smoke:meta` (1 tiny structured call; prints model, latency, usage, `cached_tokens`). | Unit tests with a fake fetch: 429→retry→ok; 400→no retry; invalid JSON→repair retry; budget reached→no call; cost computed from usage. | `pnpm test` green; `pnpm smoke:meta` prints a valid JSON object from `muse-spark-1.3`. **Record the answers to the [UNVERIFIED] items in §5.2 in `docs/VERIFIED.md`.** |
| **PR-03 db** ✅ | Drizzle schema for all tables in §3, migrations, `src/db/client.ts` (libSQL file/Turso), `pnpm db:migrate`, `pnpm db:seed` (3 demo problems from saved fixtures, team DEMO). | Repo tests on an in-memory/temp SQLite: insert/read problem; unique (judge, external_id) enforced. | `pnpm db:migrate && pnpm db:seed` on a clean checkout; tests green. |
| ~~**PR-04 deploy**~~ (dropped/optional, see `DECISIONS.md` D4) | Vercel project + Turso DB + env vars; `/api/health` live. | — (infra) | Public URL returns health JSON. |

## Day 2 — Thu Oct 29 → M2
| PR | Goal | RED test first | Verify |
|---|---|---|---|
| **PR-05 judge URL parser** ✅ | `parseProblemUrl(url)` → `{judge, contestId, index, externalId}` for all forms in US-1 AC1. | Table test of ≥ 10 URLs incl. invalid ones. | tests green |
| **PR-06 CF + AtCoder page parsers** ✅ | Fetch with browser UA + 8 s timeout; `parseCodeforcesHtml`, `parseAtcoderHtml` (statement, specs, notes, samples, limits). Save HTML fixtures for CF 4A, 1A, 1352C and AtCoder abc300_a, abc300_b. | Fixture tests: titles, limits, sample counts and exact sample text. | Offline fixture tests green; live resolve deferred by the owner's no-network brief (deployment optional per D4). |
| **PR-07 CF API + limiter** ✅ | `CfApi` with a global 1 call / 2 s limiter; `problemset.problems` daily cache; `contest.list` 10-min cache. | Limiter test with fake clock; parse fixture JSON. | Offline fixture, FIFO limiter, TTL cache and contest-phase tests green. |
| **PR-08 resolve + attempt UI** ✅ | Resolve/get problem APIs, paste fallback without LLM normalization, attempt creation, `/problem` with CodeMirror and verdict/note fields, English UI with matching Arabic keys; shared `guest_local` until sessions. | Route/service tests: zero-call cache hits, fetch/parse errors, contest guard, UTF-8 code limit, paste cache and stored attempts; transaction FK regression. | 156 tests, lint/typecheck and production build pass. Seeded-DB e2e added; sandbox denies dev-server listen with EPERM, so browser verification remains for the owner. |

## Day 3 — Fri Oct 30 → M3
| PR | Goal | RED test first | Verify |
|---|---|---|---|
| **PR-09 diagnose step** ✅ | `prompts/diagnose.ts`, `schemas/diagnosis.ts` (exactly `04-PROMPTS.md` §1), message builder with line numbers and the cache-friendly order. | Snapshot test of built messages; schema test with example A.1/B.1 JSON (valid) and broken JSON (invalid); line-range validator. | Offline tests green (184 tests); fake streamed smoke covers 4A/1A and usage. Live smoke and prompt-cache hit measurement deferred at owner's request. |
| **PR-10 pipeline + SSE + result card** ✅ | `POST /api/attempts/:id/diagnose` SSE (`stage`, `diagnosis`, `done`, `error`); attempt status transitions; S3 result card with highlighted lines (confidence ≥ 0.6). Identical-attempt cache (US-2 AC3). | Route/service tests with fake LLM: event order, internal-field isolation, 24h locale/language/verdict cache, status/error codes, 120s timeout; SSE reader/serializer and CodeMirror threshold tests. | Fresh lint/typecheck pass; `Test Files 22 passed (22)`, `Tests 205 passed (205)`; production build passes. Replay e2e deferred to PR-22 per owner. Cache copies preserve original diagnosis timestamps; failures use the existing `error` status. |
| **PR-11 eval harness** ✅ | `pnpm eval` runs the 10 cases of `04-PROMPTS.md` §9, supports selection/effort, saves full JSON and Markdown summaries, and caps cumulative cost with `EVAL_MAX_USD`. | Scorer, offline HTML provenance, no-key CLI, fake streamed table and cap tests, including blocking paid retries. | Fresh lint/typecheck pass; `Test Files 25 passed (25)`, `Tests 239 passed (239)`. No-key CLI exits 2. Live eval deferred at owner's request; counterexample verification n/a until runner PR. C++17 compilation unverified: no C++ compiler in sandbox. |

## Day 4 — Sat Oct 31 → M4
| PR | Goal | RED test first | Verify |
|---|---|---|---|
| **PR-12 ladder generation + validator** ✅ | `prompts/ladder.ts`, `schemas/ladder.ts`, `domain/ladder-validator.ts` (§3.3), stored in `hint_ladders`. | Exact schema/A.3/B.3, prompt snapshot, spoiler rules, localized fallback, cached service/one regeneration, 409 without diagnosis; fake-transport smoke/no-key tests. | Fresh lint/typecheck pass; `Test Files 30 passed (30)`, `Tests 277 passed (277)`. Red output: `/tmp/pr12-red-codex.txt`. Live smoke/eval deferred at owner's request. |
| **PR-13 reveal API + UI + re-check** ✅ | Parts A+B complete: atomic reveal/stuck/solved APIs, public reload, child attempts, locale caching, cursor history and SSE `ladder_ready`; S3 persisted safe hint cards/actions, prefilled CodeMirror re-check with auto-diagnose, localized `/me` with Cairo dates and pagination, header locale cookie toggle. | Part A: temp-DB/fake-LLM API/service tests. Part B: safe HTML/inline-code rendering, reveal progression, autostart parsing, Cairo date boundaries and locale/key parity. Red: `/tmp/pr13-red-codex.txt`, `/tmp/pr13b-red-codex.txt` (22 new failures; 294 existing passes). | Part A: 294 tests; fake full re-check reports `bug_found=false`. Part B: fresh lint/typecheck pass; `Test Files 34 passed (34)`, `Tests 316 passed (316)`; production build passes. Playwright reveal 1→4/reload/stuck/solved/re-check/history spec: `1 skipped` without `E2E_LIVE=1`; TODO(PR-22) replay. Live smoke/browser flow not run at owner's request. |
| **PR-14 i18n + RTL** | `next-intl`, `messages/ar.json` + `en.json`, `[locale]` routing, logical CSS, bidi-safe markdown renderer, STYLE_AR/EN blocks wired into prompts, ladder regenerated on language switch. | Test: every key in `en.json` exists in `ar.json`; renderer puts `dir="ltr"` on code; grep test: no `ml-`/`mr-` classes. | Manual: owner reviews 5 Arabic ladders (A3) and rates them. |

## Day 5 — Sun Nov 1 → M5
| PR | Goal | RED test first | Verify |
|---|---|---|---|
| **PR-15 runner** | `Runner` interface `{compile, run}` + `judge0` adapter (batch submissions, base64, limits, language id from `GET /languages`), `docker` adapter (dev only, refuses in production), `none`. | Contract tests against a fake Judge0 HTTP server: AC/WA/TLE/CE mapping; output cap; production refuses docker. | `pnpm smoke:runner` compiles and runs `examples/watermelon/*.cpp` on the chosen provider. |
| **PR-16 stress step** | `prompts/stress.ts`, `schemas/stress.ts`, `services/stress.ts` exactly as §2.3 (trust gate on samples, first mismatch, checker modes), re-diagnose on contradiction; SSE `stress` event; UI "Verified counterexample" box + "not verified" badge. | Service tests with a fake runner: brute fails sample → `brute_untrusted`; mismatch on test 2 → `verified`; student CE → `compile_error`; `any_valid` → `skipped`. | Live: CF 4A → verified `2 → NO vs YES`; CF 1A → verified `100000 100000 1`. Re-run `pnpm eval`: target ≥ 8/10. |

## Day 6 — Mon Nov 2 → M6
| PR | Goal | RED test first | Verify |
|---|---|---|---|
| **PR-17 explain + trace** | `prompts/explain.ts`, `schemas/explanation.ts`, server overwrite of outputs with real runner outputs, fix-line validation; `POST /explain` (locked before level 3/stuck). | Tests: locked → 403; trace outputs overwritten; invalid fix line dropped. | tests green |
| **PR-18 walkthrough player** | S4 player (framer-motion): arrays/pointers/vars/caption/code line; play/pause/step/speed/scrub; keyboard; RTL-safe. | Component tests (Testing Library): step forward changes caption; last frame shows expected vs actual. | Manual: play A.4 and B.4 fixtures in both languages. |
| **PR-19 teams + stats** | `POST /api/teams`, join by invite code, `domain/weekly-stats.ts` (pure, Cairo week boundaries), S6 dashboard table. | Pure-function tests with fixture rows: solved rate, avg hint level at solve, top tags, attention list, week boundary at Mon 00:00 Cairo. | tests green |
| **PR-20 weekly report** | Candidate fetch (§5.2 of prompts), `prompts/report.ts`, validator (ids ∈ candidates, handles ∈ team), S7 printable view; seed a synthetic week for team DEMO (20 trainees, ~120 attempts). | Validator tests; candidate filter test. | Live: DEMO report shows 5 real CF problems with working links. |

## Day 7 — Tue Nov 3 → M7 FEATURE FREEZE at 23:59
| PR | Goal | RED test first | Verify |
|---|---|---|---|
| **PR-21 contest guard** | Block `BEFORE`/`CODING` contests (US-9). | Fixture test with a CODING contest. | tests green |
| **PR-22 demo mode + replay** | `/api/session/demo`, "Try the demo" with 3 prefilled examples; `DEMO_REPLAY=1` serving recorded responses (record them with `pnpm record:demo`), "replay" badge. | Tests: replay hit → 0 network calls and badge flag true. | Pull the network cable (or set a bad key): demo still works in replay mode. |
| **PR-23 (S) voice rubber-duck** | Only if PR-01..22 are merged and green. Record ≤ 60 s → WAV → `POST /v1/asr/transcribe` (`languageBias:["Arabic","English"]`, keywords: `long long, overflow, vector, binary search, DP, greedy`) → fills the note; diagnosis `matches_student_note`. | Route test with fake ASR; WAV header test. | Live: say "فكرتي إني أضرب الاتنين في بعض" and see it in the note. |
| **PR-24 polish pass** | Loading skeletons, empty states, error cards copy, favicon/OG image, README screenshots. | — | Lighthouse ≥ 85 performance on landing. |

## Day 8 — Wed Nov 4 → M8 (no new features)
- 10:00–13:00 Bug fixes only from rehearsal. Rehearse the demo script 3× on the deployed URL (`06-DEMO-AND-SUBMISSION.md`). Each rehearsal: all 3 examples must pass.
- 13:00–17:00 Record the video (storyboard in `06`), edit, upload (YouTube unlisted or Loom), check it plays logged-out.
- 17:00–20:00 Final README (problem, demo link, video link, how Meta models are used, architecture image, setup, eval results, cost per attempt, limits), tag `v1.0.0`.
- 20:00–22:00 Fill and submit the CV form (checklist in `06`). Screenshot the "Project submitted" state.

## Day 9 — Thu Nov 5, 00:00–04:00 (buffer)
- Only fix a broken deploy or a broken link. Do not change the repo URL after the deadline.

## If behind schedule (cut order)
1. Drop PR-23 voice (stretch).
2. Drop PR-20 LLM narrative: show deterministic stats + recommended problems by rule only.
3. Simplify PR-18: step-through without animation (still frames + captions).
4. Runner off (`RUNNER_PROVIDER=none`) in prod, keep verified counterexamples in replay recordings for the video — say so honestly.
Never cut: diagnosis, hint ladder, Arabic, demo mode/replay, deployed URL.
