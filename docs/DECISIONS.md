# Decisions log

Changes to the plan pack agreed with the owner after it was written. When a decision here contradicts another doc, this file wins.

| # | Date (Cairo) | Decision | Replaces / affects |
|---|---|---|---|
| D1 | 2026-10-29 | **Solo builder.** No teammates. | `01-PLAN.md` Open Question 1 (team). |
| D2 | 2026-10-29 | **Any coding tool may build the app** (Muse Code, other agents, or by hand). The app's **only LLM is the Meta Model API (Muse Spark)**. | Open Question 2. AGENTS.md LLM rules unchanged. |
| D3 | 2026-10-29 | **No paid services.** No Judge0 (RapidAPI) charges. The code runner will be a **local Docker runner** (light `g++` container with CPU/memory/network limits), plus `none`. | Open Question 4; `03-ARCHITECTURE.md` §1/§10 runner providers; PR-15 (the `judge0` adapter becomes optional, `docker` is the main provider). |
| D4 | 2026-10-29 | **No hosted deploy required.** Organizers (Cerebral Valley, Discord, Oct 29): judges do not get their own key or a hosted version; the project must run from the **public repo's setup instructions plus the 3-minute demo video**. The README must explain how to supply a Meta Model API key (via `.env.example`), and our own key is never committed. A judge path that runs on **recorded sample runs is accepted** with as much demo provenance as possible. | PR-04 (Vercel + Turso) is **dropped / optional**. "Deployed URL" in M1/M7, the "Never cut" list in `05-BUILD-PLAN.md`, and `06-DEMO-AND-SUBMISSION.md` now mean "runs locally with one command". Turso is optional; local SQLite file is the default. |
| D5 | 2026-10-29 | **Recorded runs (replay mode) are a first-class judge path**, not only a demo fallback. The $150 credits are valid only for the 10-day development window, so judging may happen without live credits. Replay recordings must carry provenance (date, model id, request hash, usage). | PR-22 (demo mode + replay) priority goes up. |
| D6 | 2026-10-29 | **Contributor-mode models are OK for development traffic.** Note: while on free credits, Meta's billing page says content may be used to improve their products anyway. The default for recorded/demo runs stays `muse-spark-1.3` (Standard). | Open Question 5; `.env.example` comment. |
| D7 | 2026-10-29 | **Meta API key not available yet.** Key creation on dev.meta.ai fails on Meta's side ("Could not load API keys" / "Failed to create API key"); a support ticket is being filed. Until a key exists, **all LLM work uses fakes/recorded fixtures**; `pnpm smoke:meta` (PR-02) waits for the key. $150 credits are confirmed active on the Billing page. | PR-02 verify step; M1 "smoke:meta passes". |
| D8 | 2026-10-29 | Product name: **Daleel stays a placeholder** until the owner picks one. | Open Question 1 (name). |
| D9 | 2026-10-29 | Package manager **pnpm** (chosen in PR-01, never mix). | `03-ARCHITECTURE.md` §1. |

| D10 | 2026-10-29 | **Meta API key now available** (env only, never committed or sent to third-party coding relays). `pnpm smoke:meta` ran live once in PR-02; results in `VERIFIED.md`. Supersedes the "waits for the key" part of D7; tests still use fakes only. | D7, M1. |

Still open: Open Question 3 (can 5–10 trainees test on Nov 2–3 and appear anonymised in the video).
