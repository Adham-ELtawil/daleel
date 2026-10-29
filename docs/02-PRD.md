# Daleel — Product Requirements (PRD)

Status: frozen for the hackathon on Oct 27, 2026. Changes need the owner's OK (see `AGENTS.md`).
Priority labels: **M** = MVP must-have, **S** = stretch (only after every M is green), **X** = explicitly out (see `01-PLAN.md` Not Doing).

## 1. Personas
| Persona | Description | Main job |
|---|---|---|
| **Trainee** (student) | CF rating 800–1600, C++ with a personal template (macros), Egyptian Arabic speaker, reads English statements. | "Tell me *where* my thinking/code breaks, without spoiling the problem." |
| **Coach** | Runs a university CP training group (~100 trainees). | "Tell me what my group is weak at this week and what to practise next." |
| **Judge / visitor** | Opens the live demo URL. | "Show me it works, fast, without signing up." |

## 2. Screens
| ID | Screen | Route | Priority |
|---|---|---|---|
| S0 | Landing + "Try the demo" (pre-filled examples) + language toggle | `/` | M |
| S1 | Join: enter handle (+ optional team invite code), choose Trainee/Coach | `/join` | M |
| S2 | New attempt: problem link or statement, code editor, optional verdict + "my idea" note | `/attempt/new` | M |
| S3 | Attempt workspace: problem summary (left), code with highlighted lines (center), coach panel (right): diagnosis status → counterexample → hint ladder → explanation + walkthrough | `/attempt/[id]` | M |
| S4 | Walkthrough player (inside S3, full-width modal): play / pause / step / speed, frames of arrays/variables, caption per frame | `/attempt/[id]#walkthrough` | M |
| S5 | My history: list of attempts with status (solved / stuck / in progress), hint level used | `/me` | M |
| S6 | Coach dashboard: team list, invite code, this week's report, per-trainee table | `/coach/[teamId]` | M |
| S7 | Weekly report view (printable): top weak topics, bug classes, trainees needing attention, 5 recommended problems, suggested session plan | `/coach/[teamId]/report/[weekStart]` | M |
| S8 | Voice "explain your idea" recorder (in S2) | — | S |
| S9 | Screenshot of statement → problem (in S2) | — | S |

Layout rule: in Arabic mode the whole UI is `dir="rtl"`; **code, problem statements, inputs/outputs and the walkthrough canvas are always `dir="ltr"`**.

## 3. Flows

### F1. Trainee: from Wrong Answer to understanding (the core flow)
1. S2: paste `https://codeforces.com/problemset/problem/4/A` → app shows the title + samples within 3 s (from cache or fetch). If fetch fails → "Paste the statement" textarea appears with the error message.
2. Paste code, pick language (C++17 default), optionally pick reported verdict (`WA` / `TLE` / `MLE` / `RE` / `CE` / `Not submitted`) + test number, optionally write "my idea" (any language).
3. Press **Diagnose** → S3 with live progress stages: `Reading problem` → `Analysing your code` → `Trying to break your code` → `Preparing hints`.
4. Result card shows a **one-line non-spoiling summary** ("There is an edge case your condition does not handle") + highlighted suspicious lines (if the diagnosis is confident) + **Verified counterexample** box (if the stress test found one) or "Couldn't verify by running — this diagnosis is the model's opinion" badge.
5. Hint ladder shows **Hint 1** button. Each reveal shows the next level; levels already revealed stay visible.
6. At any time: **I fixed it → re-check** (opens the editor pre-filled; creates a child attempt; re-runs F1 from step 3) or **I solved it** (marks attempt solved, records the hint level).
7. After Hint 3, or when the trainee presses **I'm stuck**, the **Full explanation** + **Watch walkthrough** become available.

### F2. Hint ladder contract
| Level | Name | Content | Must NOT contain |
|---|---|---|---|
| 1 | Nudge | Where to look (which part of the code or which kind of input), as a question back to the trainee. | Any code, the fix, the failing input. |
| 2 | Concept | The idea/observation they are missing (e.g. "the two parts must each be positive"). | Any code, the exact fix. |
| 3 | Precise | The exact problem in their lines, in words, + the failing input if verified. | A code block, a full solution. |
| 4 | Full explanation | Why it fails, the correct reasoning, a corrected version **of the trainee's own lines only** (diff-style), complexity note, + walkthrough. | A fresh full solution written from scratch. |

### F3. Stuck → walkthrough
1. Trainee presses **Watch walkthrough**.
2. App requests a trace for the failing input (verified counterexample if any, else the smallest sample/suspect input).
3. Player animates frames: arrays as cells, pointers as arrows, variables as chips, current code line highlighted, caption in the selected language. Controls: play/pause, step back/forward, speed 0.5x/1x/2x, frame scrubber.
4. The last frame shows "expected vs your output".

### F4. Coach weekly report
1. Coach creates a team (S6) → gets an invite code (6 chars). Trainees join with it in S1.
2. S6 shows this week (Mon 00:00 → Sun 23:59, Cairo): attempts, solved rate, average hint level at solve, top bug classes, top weak topics (from diagnosis tags), trainees with ≥3 stuck attempts.
3. **Generate report** → deterministic stats (no LLM) + one LLM call that writes the narrative + session plan and picks **5 problems from a candidate list** the backend fetched from the Codeforces API (by weak tag and rating band). Saved per (team, week); regenerate allowed.
4. S7 printable view; the coach can switch the report language.

### F5. Demo flow for judges (no signup)
`/` → **Try the demo** → auto-joins as `guest-xxxx` in team `DEMO` → S2 pre-filled with one of 3 seeded examples (CF 4A Watermelon, CF 1A Theatre Square, one AtCoder ABC problem) → Diagnose. The seeded team has a week of realistic synthetic attempts so S6/S7 are populated.

## 4. User stories with acceptance criteria

### US-1 Problem intake (M)
*As a trainee, I paste a Codeforces or AtCoder link and the app understands the problem.*
- AC1: Accepts `codeforces.com/problemset/problem/{c}/{i}`, `codeforces.com/contest/{c}/problem/{i}`, `codeforces.com/gym/...` (gym → paste fallback), `atcoder.jp/contests/{c}/tasks/{t}`.
- AC2: Extracts title, time/memory limit, statement, input spec, output spec, notes, **all samples** (input/output pairs). Unit-tested on saved HTML fixtures of ≥3 CF and ≥2 AtCoder pages.
- AC3: Result is cached in `problems` by `(judge, external_id)`; a second resolve makes **0** network calls.
- AC4: If fetch/parse fails (403, timeout 8 s, parse error) the UI shows the paste box with a clear message; the paste path stores `judge='custom'`.
- AC5: CF problems get `rating` and `tags` from `problemset.problems` (cached daily); the app never calls the CF API more than once per 2 s (shared limiter).

### US-2 Submit code (M)
- AC1: Code ≤ 64 KB, language ∈ {`cpp17`, `python3`}; otherwise 400 with message.
- AC2: Optional verdict + test number + note (≤ 1000 chars).
- AC3: An identical (problem, code hash, locale) attempt within 24 h reuses the cached diagnosis (no LLM call).

### US-3 Diagnosis (M)
- AC1: Returns a `Diagnosis` object that validates against `DiagnosisSchema` (see `04-PROMPTS.md`); invalid output → one retry → error card with "Try again".
- AC2: Shows progress stages via SSE within 1 s of pressing Diagnose; total p50 ≤ 25 s, hard timeout 120 s.
- AC3: Highlights lines only when `confidence ≥ 0.6`; otherwise shows "Not sure exactly where" wording.
- AC4: Never shows internal fields (`root_cause_internal`, `fix_internal`) before Hint 3/4.
- AC5: Template boilerplate (macros, fast IO, `#define`s) is not reported as the bug unless it *is* the bug (eval case included).

### US-4 Hint ladder (M)
- AC1: One LLM call produces all 4 levels for the attempt's locale; reveals read from DB (reveal latency < 300 ms).
- AC2: Levels 1–3 contain **no fenced code block** and no line copied from `fix_internal` (automated validator; on violation → regenerate once → else drop the offending level text and show a generic hint).
- AC3: `POST /hints/next` reveals strictly in order; revealing level n records `revealed_at`; level 5 → 409.
- AC4: Switching language regenerates the ladder in that language once and caches it; revealed level count is preserved.

### US-5 Verified counterexample (M, feature-flagged `RUNNER_PROVIDER`)
- AC1: The model returns a brute-force C++ program + ≤ 12 small tests. The runner compiles and runs **brute on all official samples first**; if brute fails any sample, stress result = `brute_untrusted` (not shown as verified).
- AC2: Student code and brute run on each test with 2 s CPU / 256 MB / no network; the first output mismatch (whitespace-normalised, case-insensitive for YES/NO) becomes `failing_input`, `expected_output`, `actual_output`.
- AC3: Compile error in student code → shows the compiler message (first 30 lines) and a CE-specific hint.
- AC4: With `RUNNER_PROVIDER=none` the step is skipped and the UI shows the "not verified" badge; the rest of the flow still works.
- AC5: Total stress step ≤ 30 s; runner errors never break the attempt page.

### US-6 Explanation + walkthrough (M)
- AC1: Available only after level 3 is revealed or after "I'm stuck".
- AC2: `Walkthrough` validates against `TraceSchema`; ≤ 40 frames; each frame has a caption in the locale.
- AC3: Player supports play/pause, step ±1, speed, scrub; keyboard ← → space.
- AC4: Works in RTL mode without mirroring arrays (arrays always left→right).

### US-7 Language (M)
- AC1: Toggle `ar-EG` / `en` in the header; persists in cookie; default from `Accept-Language`.
- AC2: All UI strings come from `messages/ar.json` and `messages/en.json` (no hard-coded strings; a test fails on missing keys).
- AC3: Model output in Arabic keeps technical terms in English; code, identifiers, inputs and outputs are rendered in `<code dir="ltr">` / `<bdi>`.

### US-8 Coach team + weekly report (M)
- AC1: Create team → invite code; join with code; a coach sees only their teams.
- AC2: Weekly stats are computed by a pure function from DB rows (unit-tested with fixtures): attempts, solved, solved-rate, avg hint level at solve, top 5 tags, top 3 bug classes, trainees needing attention (≥ 3 unsolved attempts or avg hint level ≥ 3.5).
- AC3: Recommended problems are always real CF problems from the candidate list (validator rejects any id not in the list).
- AC4: Report generation ≤ 40 s; cached per (team, week, locale).

### US-9 Live-contest guard (M)
- AC1: For a CF problem whose contest has `phase` ∈ {`BEFORE`, `CODING`} in `contest.list` (cached 10 min), diagnosis is refused with a friendly message. Unit-tested with a fixture.

### US-10 History (M)
- AC1: `/me` lists the trainee's attempts newest first with problem, status, max hint level, date.

### US-11 Demo mode (M)
- AC1: "Try the demo" works with no typing; seeded data exists after `npm run db:seed`.
- AC2: `DEMO_REPLAY=1` serves recorded LLM responses for the 3 seeded examples if the Meta API is down (see `07-RISKS.md`), with a small "replay" badge so it is honest.

### US-12 Voice rubber-duck (S)
- AC1: Record ≤ 60 s in S2; server converts to 16 kHz/24 kHz mono 16-bit WAV and calls `POST /v1/asr/transcribe` with `languageBias: ["Arabic","English"]` and CP keywords; transcript fills the "my idea" note.
- AC2: Diagnosis compares the stated idea with the code (`approach.matches_code`).

### US-13 Statement screenshot (S)
- AC1: Upload PNG/JPG ≤ 4 MB → Muse Spark image understanding → `ProblemSchema` → user confirms the parsed text.

### US-14 CF handle import for coaches (S)
- AC1: Coach pastes trainee CF handles → `user.status` (rate-limited) → weak tags from non-OK verdicts over the last 30 days merged into the report.

## 5. Non-functional requirements
- **Reliability for demo:** the 3 seeded examples must work 10/10 times in rehearsal; replay mode as last resort.
- **Cost:** ≤ $0.08 average per attempt (all steps); daily budget guard (`DAILY_BUDGET_USD`) returns 503 "budget reached" instead of spending.
- **Privacy:** no real names required; handles only. `safety_identifier` = SHA-256 of user id. Code is stored only to show history.
- **Accessibility:** keyboard navigable; contrast AA; the player has text captions.
- **Performance:** first paint < 2 s on a laptop; hint reveal < 300 ms.

## 6. MVP vs stretch summary
| Feature | Priority | Build day (see `05-BUILD-PLAN.md`) |
|---|---|---|
| Problem intake + cache + paste fallback | M | Day 2 |
| Submit code | M | Day 2 |
| Diagnosis | M | Day 3 |
| Hint ladder + re-check | M | Day 4 |
| Arabic/English + RTL | M | Day 4 |
| Verified counterexample | M (flagged) | Day 5 |
| Explanation + walkthrough player | M | Day 6 |
| Coach team + weekly report | M | Day 6 |
| Live-contest guard | M | Day 7 |
| Demo mode + replay | M | Day 7 |
| Voice rubber-duck | S | Day 7 (only if all M green) |
| Statement screenshot | S | Day 8 morning, if time |
| CF handle import | S | after hackathon |
