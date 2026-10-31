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
| **PR-14 i18n + RTL ✅** (D11: typed i18n + cookie instead of next-intl; D12: lite Arabic style prompts) | `next-intl`, `messages/ar.json` + `en.json`, `[locale]` routing, logical CSS, bidi-safe markdown renderer, STYLE_AR/EN blocks wired into prompts, ladder regenerated on language switch. | Test: every key in `en.json` exists in `ar.json`; renderer puts `dir="ltr"` on code; grep test: no `ml-`/`mr-` classes. | Manual: owner reviews 5 Arabic ladders (A3) and rates them. |

## Day 5 — Sun Nov 1 → M5
| PR | Goal | RED test first | Verify |
|---|---|---|---|
| **PR-15 runner ✅** (D13: local g++ + bwrap; Judge0 not built) | `Runner` interface `{compile, run}` + `judge0` adapter (batch submissions, base64, limits, language id from `GET /languages`), `docker` adapter (dev only, refuses in production), `none`. | Contract tests against a fake Judge0 HTTP server: AC/WA/TLE/CE mapping; output cap; production refuses docker. | `pnpm smoke:runner` compiles and runs `examples/watermelon/*.cpp` on the chosen provider. |
| **PR-16A stress core ✅** | Strict StressPlan schema, verbatim prompt + env config, stress service: sample trust gate, first mismatch, checker modes, runner limits/deadline, stress_runs upsert, safe StressPublic and contradiction flag. Replay demo finds recordings by current provenance/content. | Fake LLM/runner tests cover trust gate, test 2 mismatch, CE, skipped/error/no_mismatch, suspects, limits, cleanup, deadline, public fields and upsert; schema equals §2.2. | Offline `pnpm lint && pnpm typecheck && pnpm test`; red output `/tmp/pr16a-red-codex.txt`. No live calls. |
| **PR-16B1 stress pipeline ✅** | Diagnose → stress → ladder integration; SSE `stress`; safe stress on GET reload; production runner + replay-aware LLM; eval `--stress`; smoke:stress 4A/1A. No UI. | Fake runner/LLM: SSE order diagnosis → stress → ladder_ready → done; skips; stress errors preserve diagnosis; GET metadata/privacy; smoke no-key/provider guards; eval verified counts. Red: `/tmp/pr16b1-red-codex.txt`. | Fresh lint/typecheck pass; `Test Files 51 passed, 1 skipped (52)`; `Tests 469 passed, 5 skipped (474)`. Live smoke/eval deferred at owner's request. No new external facts for `VERIFIED.md`. |
| **PR-16B2 stress UI ✅** | Waiting stage, verified counterexample, compiler output capped at 30 lines, localized not-verified reasons and contradiction note; SSE + reload data. Automatic re-diagnosis on contradiction remains deferred beyond this UI-only PR. | Static-render tests: every status, LTR output, compiler cap/escaping, contradiction/privacy, waiting state; SSE stress reader and i18n parity. Red: `/tmp/pr16b2-red-codex.txt` (14 expected failures). | Fresh lint/typecheck pass; `Test Files 52 passed, 1 skipped (53)`; `Tests 485 passed, 5 skipped (490)`. Live CF 4A/1A smoke and eval deferred at owner's request. No new external facts for `VERIFIED.md`. |

## Day 6 — Mon Nov 2 → M6
| PR | Goal | RED test first | Verify |
|---|---|---|---|
| ✅ **PR-17 explain + trace** | `prompts/explain.ts`, `schemas/explanation.ts`, server overwrite of outputs with real runner outputs, fix-line validation; `POST /explain` (locked before level 3/stuck). | Tests: locked → 403; trace outputs overwritten; invalid fix line dropped. | tests green; smoke:explain tested with fakes only |
| ✅ **PR-18 walkthrough + explanation UI** | Simplified per cut item 3: still frames + captions, no animation/packages. Unlocked explanation fetch, SafeMd, own-line diff, complexity; arrays/pointers/vars/code highlights; play/pause/step/speed/scrub; RTL-safe keyboard. | Pure reducer + static component tests; A.4/B.4 final outputs in both locales, escaping, highlight/pointer rendering, translations and unlock gate. Red: `/tmp/pr18-red-codex.txt` (18 expected failures; 502 existing passes). | Fresh lint/typecheck pass; `Test Files 60 passed, 1 skipped (61)`; `Tests 522 passed, 5 skipped (527)`. Four offline Playwright scenarios authored; browser/manual playback blocked by sandbox EPERM on localhost listen and Chromium startup. No external facts confirmed. |
| **PR-19A teams + stats backend** ✅ | Handle-only sessions with HMAC cookies and guest fallback; coach team creation, 8-character invites, student joins; pure Cairo weekly stats and owner-only stats API. Existing attempt paths use the session identity. | Original red: `/tmp/pr19a-red-codex.txt` (28 failures); two additional ownership regressions cover attempt reads/status/history and diagnosis. DST, attention thresholds, topic/bug rankings, cookie tampering, invite rollback and coach access tested offline. | Fresh lint/typecheck pass; `Test Files 65 passed, 1 skipped (66)`; `Tests 571 passed, 5 skipped (576)`. Prettier applied. No live Meta calls. |
| **PR-19B demo team + coach UI** ✅ | `pnpm db:seed --demo-team`: coach_demo, 20 trainees, 120 synthetic diagnosed CF attempts across current/previous Cairo weeks; upgrades legacy DEMO in place. `/coach` reuses Part A sessions/stats with team/week pickers, invite, summary, trainee table, attention and topic/bug lists in both locales. | Red: `/tmp/pr19b-red-codex.txt` (13 expected failures, 571 existing passes); CLI regression red: `/tmp/pr19b-cli-red-codex.txt`. Fourteen new tests cover deterministic/idempotent seeding, DST rollover, CLI runs, localized fixture rendering and access isolation. | Fresh lint/typecheck pass; `Test Files 67 passed, 1 skipped (68)`; `Tests 585 passed, 5 skipped (590)`. Prettier applied. Exact seed command succeeds using `node --import tsx`; existing local migration applied. Each seeded week: 20 trainees, 60 attempts, 36 solved, 8 attention. No live Meta calls or new external API facts. |
| **PR-20 weekly report** ✅ | Cut item 2: report computed on open from existing team stats; top-three weak tags, median solved CF rating ±200 or 800–1400, all member attempts excluded, five problems easier-to-harder. Localized attention suggestions and 90-minute session plan; coach-only `/coach/report?team=&week=` with print CSS and `/coach` link. Reuses DEMO seed; no LLM. | Red: `/tmp/pr20-red-codex.txt` (30 expected failures, 585 existing passes). Candidate boundaries/exclusions, stable ordering, validator, DEMO snapshot, historical attempts, ownership, both locales and printable markup. | Fresh lint/typecheck pass; `Test Files 70 passed, 1 skipped (71)`; `Tests 615 passed, 5 skipped (620)`. Prettier applied; production build passes with a temporary SESSION_SECRET and no model key. DEMO renders five CF links offline. Five curated catalogue additions have separate fixture provenance; live metadata/link verification blocked by CF DNS resolution. Browser print check blocked by Chromium sandbox EPERM. No new external facts confirmed. |

PR-18 keyboard choice: controls stay LTR in both locales, so ← always steps to the previous frame and → to the next. Space toggles playback when the player is focused; buttons, speed select and scrubber keep their native keyboard behavior. Manual stepping and scrubbing pause playback; playing after the final frame restarts from the beginning.

## Day 7 — Tue Nov 3 → M7 FEATURE FREEZE at 23:59
| PR | Goal | RED test first | Verify |
|---|---|---|---|
| **PR-21 contest guard ✅** | Block `BEFORE`/`CODING` at resolve, creation and diagnosis; creation/diagnosis recheck cached problems; localized message (US-9). CF API failures allow with a logged code; AtCoder skipped. | Saved contest fixture edited in memory; phase, failure, cache and route regressions. Red: `/tmp/pr21-red-codex.txt` (8 failures). | Lint + typecheck passed; `Test Files 61 passed, 1 skipped (62)`; `Tests 540 passed, 5 skipped (545)`. Two browser tests added; execution blocked by sandbox listener EPERM. |
| **PR-22A replay store + client + record script ✅** | Provenance JSON store, replay/record client modes, environment wiring, health flag, `pnpm record:demo` through three demo service flows plus fixed 4A re-check. Split from PR-22 to keep implementation below ~450 lines. | Replay hit/miss/validation → 0 network; stable hashes; secret exclusion; budget guard; record and replay all eight service calls in temporary DBs. | Offline fake-transport verification passed with an empty replay key. Genuine Meta recordings remain owner-run; no live calls made. See `REPLAY.md`. |
| **PR-22B demo session + UI badge ✅** | `/api/session/demo` descriptors for 3 shared examples, "Try the demo" creates exact prefilled attempts with locale cookie and autostart; persisted replay dates and translated badges. | Demo session → 3 exact code examples; committed 4A replay SSE + ladder_ready → 0 network; live fake → replay false; hints/reload/cache provenance; badge and i18n parity. Red: `/tmp/pr22b-red-codex.txt` (9 new failures; 329 existing passes). | Offline suite: `Test Files 39 passed (39)`, `Tests 338 passed (338)`. See `REPLAY.md` for the no-key judge path and JSON provenance storage. |
| **PR-23 (S) voice rubber-duck** | Only if PR-01..22 are merged and green. Record ≤ 60 s → WAV → `POST /v1/asr/transcribe` (`languageBias:["Arabic","English"]`, keywords: `long long, overflow, vector, binary search, DP, greedy`) → fills the note; diagnosis `matches_student_note`. | Route test with fake ASR; WAV header test. | Live: say "فكرتي إني أضرب الاتنين في بعض" and see it in the note. |
| **PR-24A polish ✅** | Items 2, 3, 5, 7, 8: localized bug labels, explicit diagnosis retry/reset with stale claims, skeletons/empty/error states, judge-aware Yes/No comparison, local-runner stress recordings. | Red: `/tmp/pr24a-red-codex.txt`; abc303_a sample/test/trust gate, retry/cache/reset/concurrency, both locales and local/none recording/replay. | Fresh lint/typecheck pass; `Test Files 72 passed, 1 skipped (73)`; `Tests 645 passed, 5 skipped (650)`. Prettier applied. No new external facts for VERIFIED.md; no live calls or re-recording. |
| **PR-24B polish ✅** | Items 1, 4, 6, 9, 10: branded header/RTL/metadata/favicon, safe collapsible statement panel, judge README, seeded demo coach entry, explanation/walkthrough recording. | Red: `/tmp/pr24b-red-codex.txt` (16 failures); both locales, statement escaping/LTR samples, seeded/unseeded coach entry and session POST, local/none record/replay with explain. | Fresh lint/typecheck pass; `Test Files 74 passed, 1 skipped (75)`; `Tests 659 passed, 6 skipped (665)`. Prettier applied. Browser checks blocked by sandbox `listen EPERM`; Lighthouse ≥ 85 unverified (CLI unavailable). Explain recording absent: committed replay check skips; fake replay passes. No new external facts for VERIFIED.md; owner re-records after merge, no live calls made. |

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
