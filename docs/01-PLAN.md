# Daleel — one-page plan (idea-refine output)

## Problem Statement
**How might we** help Arab competitive programmers find *why their own* Codeforces/AtCoder solution is wrong, and learn from it, without being handed the answer, in the language they actually think in (Egyptian Arabic with English technical terms)?

## Who it is for (sharpened)
- **Primary user: the trainee.** University CP trainee, Codeforces rating roughly 800–1600 (Div. 3 / Div. 2 A–D), writes C++ (often with a personal template full of macros), gets *Wrong Answer on test 7* and has no idea why. Today they either stare at the code, read the editorial (spoils the learning) or paste into a generic chatbot (spoils the learning, English-only reasoning, often wrong about the actual bug).
- **Secondary user: the coach.** Runs a university training community (the owner runs one of ~100 trainees). Has no visibility into *what* trainees get stuck on; picks the next session's topics by gut feeling.
- **Success looks like:** a trainee goes from "WA, no idea" to "I see the bug" after hint 1–2 in most cases, and a coach opens a weekly report that names the 3 weakest topics of the group with real problems to practise.

## Variations considered (and why the chosen one wins)
1. **Generic "explain my bug" chatbot** — rejected: it is ChatGPT with a skin; zero differentiation; spoils solutions.
2. **Inversion: the AI never talks, it only runs your code against generated tests and shows the failing input** — strong technical core (kept as the *Verified counterexample* feature), but alone it does not teach the idea.
3. **Hint ladder with a no-spoiler contract** — the learning core (kept).
4. **10x simpler: a Telegram bot** — tempting for reach, but a judge-facing demo needs a visual walkthrough and a coach dashboard; rejected for the hackathon, noted as post-hackathon.
5. **Coach-first analytics from Codeforces API only (no AI)** — cheap and real, but weak on "use of Meta AI"; kept only as the data source for recommendations.
6. **Voice rubber-duck: trainee explains the idea out loud in Egyptian Arabic; the model compares what they *said* with what they *coded*** — unique, uses Muse Voice Transcribe (Arabic supported); kept as **stretch #1**.
7. **Expert lens (a real ICPC coach): diagnose the *thinking* error, not only the code error** (wrong greedy, missed edge case, overflow, wrong complexity) — kept: the diagnosis schema classifies the *bug class* and the *approach*, which also feeds the coach report.

## Recommended Direction
A web app where the trainee pastes a Codeforces/AtCoder link (or the statement) plus their code. **Muse Spark** diagnoses the real root cause (structured JSON, high reasoning effort), then the app **proves** it when possible: it asks the model for a tiny brute-force + small tests, runs both programs in a sandbox and shows a **verified failing input** ("your code prints YES for w = 2, correct answer is NO"). The trainee then climbs a **4-step hint ladder** (nudge → concept → precise fix in words → full explanation with an **animated walkthrough** of their own code on the failing input). Everything is available in **Egyptian Arabic or English**, with code and terms kept in English and RTL rendered correctly.

Every diagnosis is tagged with topics and a bug class, so the **coach dashboard** turns a week of attempts into a weak-topic report with **real** practice problems pulled from the Codeforces API (the model chooses only from a candidate list we fetch, so it cannot invent problems).

This direction maximises the judging weights: **Impact 30%** (real community, real pain, Arabic-first), **Meta tooling 25%** (structured output, reasoning-effort tuning per step, prompt caching, model writes and *we execute* tests, optional voice + image input, built with Muse Code), **Demo 25%** (one 60-second "wow" moment: the verified counterexample + walkthrough animation), **Technical depth 20%** (sandboxed execution, schema-constrained pipeline, eval harness, cost guard).

## Key Assumptions to Validate (with the test, and when)
- [ ] **A1. Muse Spark finds the real bug in ≤1600-rated CF problems at least 8/10 times.** Test: eval harness (PR-09) with 10 known-wrong solutions to well-known problems; day 3.
- [ ] **A2. The model writes a correct brute force for small constraints, and it passes the official samples.** Test: stress step only trusts a brute that passes all scraped samples; measure pass rate on the eval set; day 5.
- [ ] **A3. Egyptian Arabic hints read naturally and keep terms in English.** Test: owner + 3 trainees rate 10 hint ladders 1–5; target average ≥4; day 4–5.
- [ ] **A4. Hints do not spoil.** Test: automated check that levels 1–3 contain no code block and no literal fix line; manual review on eval set; day 4.
- [ ] **A5. Codeforces problem pages can be fetched from the deployed server.** Verified from our box today: CF problem pages → 200 with a browser User-Agent, 403 without one. Must re-test from the deploy host on day 2; paste fallback is mandatory anyway.
- [ ] **A6. Meta credits arrive and the API is stable enough for a live demo.** Test: `npm run smoke:meta` daily; if not by Oct 29, use the fallback in `07-RISKS.md`.
- [ ] **A7. Coaches value the weekly report.** Test: show the owner's own trainee group a seeded report; one sentence of feedback for the video.

## MVP Scope (must ship, in this order)
1. Problem intake: Codeforces/AtCoder URL → statement + samples (cached); paste fallback; 3 pre-seeded demo problems.
2. Code submission (C++17 first-class; Python accepted for diagnosis only), optional "verdict I got" and "my idea" note.
3. Diagnosis (Muse Spark, structured output).
4. Hint ladder: 4 levels generated in one call, revealed one at a time; "I fixed it, re-check" loop.
5. Verified counterexample via sandboxed run (feature-flagged; diagnosis still works when the runner is off).
6. Full explanation + animated walkthrough (trace JSON → in-browser player), only after level 3 or "I'm stuck".
7. Egyptian Arabic ↔ English toggle with correct RTL.
8. Coach dashboard: team with invite code, weekly weak-topic report + 5 real recommended CF problems.
9. Live-contest guard: refuse help on a problem from a Codeforces contest that is currently running.

## Not Doing (and Why)
- **Real accounts / OAuth / passwords** — demo needs zero friction; use handle + team invite code with a signed cookie. Post-hackathon.
- **A full online judge or our own test data** — we are a coach, not a judge; we only run tiny stress tests.
- **Languages beyond C++ (execution)** — 95%+ of the target users write C++; Python is diagnosis-only.
- **Writing a complete solution at any level** — the product's contract is "no spoilers"; level 4 shows a fix *to the student's own lines* and an explanation, never a fresh full solution.
- **Help during live contests** — integrity; also a selling point for coaches.
- **Manim/video rendering on the server** — too slow and heavy; the walkthrough is a JSON-driven browser animation. Manim is used only for the demo video intro, offline.
- **Fine-tuning or self-hosting Llama/Muse Spark Open** — no time, no GPU budget; open weights are only a fallback provider (see `07-RISKS.md`).
- **LeetCode/CodeChef/other judges** — two judges are enough to prove the idea.
- **Mobile app, Telegram bot, notifications, payments, plagiarism detection** — not needed to prove the core value in 9 days.
- **Muse Wonder in the app** — 3–5x the price of Muse Spark ($4/$20 vs $1.25/$4.25 per 1M tokens) for a task Spark handles; keep it as an optional A/B for the diagnose step only if the eval says Spark misses bugs.

## Open Questions (only the owner can answer)
1. Final product name (Daleel is a placeholder) and team: solo or up to 4 teammates (Indie track allows up to 4)?
2. Who builds: Muse Code (recommended: uses the Meta credits and counts as "use of Meta tooling"), Cursor (needs on-demand usage) or the owner by hand?
3. Can 5–10 trainees try it on Nov 2–3 and agree to appear (voice or anonymised screen) in the video?
4. Is a $1–3 Judge0 (RapidAPI, pay-per-use) charge on the virtual card OK, or should execution run only on a local Docker sandbox?
5. Is it OK to use Contributor-mode models (cheaper, content may train Meta models) for **development** traffic only? The app itself defaults to Standard mode.
6. What does the gated "Details" page say about problem statements, video length, and repo visibility? (Screenshot needed; see `06-DEMO-AND-SUBMISSION.md`.)
