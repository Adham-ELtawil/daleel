# Daleel — AI training coach for Arab competitive programmers (pre-build pack)

> Working name: **Daleel** (دليل, "guide"). Rename freely; nothing depends on it.
> Hackathon: Meta Global AI Developer Hackathon (Cerebral Valley, remote).
> Submission deadline: **Nov 4, 2026, 9:00 PM ET = Nov 5, 2026, 02:00 UTC = Nov 5, 04:00 Cairo**.
> Pack prepared: Oct 27, 2026 (Cairo). Every API fact is cited in `03-ARCHITECTURE.md` §11 (Sources). Anything not verified is marked **[UNVERIFIED]**.

## What this pack is
Everything a coding agent (Muse Code, Cursor, Claude Code…) or a human needs to start building on day 1 with zero ambiguity:
the product decision, the exact MVP scope, the architecture, the prompts and JSON schemas, a PR-sized build plan, the demo/video plan, and the risks.

## Reading order
| # | File | Who must read it | Time |
|---|------|------------------|------|
| 1 | `01-PLAN.md` | Everyone. The one-page decision: problem, direction, MVP, **Not Doing** list. | 5 min |
| 2 | `02-PRD.md` | Builder. User stories, screens, flows, acceptance criteria (MVP vs stretch). | 15 min |
| 3 | `03-ARCHITECTURE.md` | Builder. Stack, components, data model, API routes, Meta API integration, cost, security. | 20 min |
| 4 | `04-PROMPTS.md` | Builder. System prompts + JSON schemas for each LLM step, 2 worked examples (CF 4A, CF 1A). | 15 min |
| 5 | `05-BUILD-PLAN.md` | Builder. Day-by-day PR list Oct 27 → Nov 5 04:00, each with its test/verify step. | 10 min |
| 6 | `06-DEMO-AND-SUBMISSION.md` | Owner. Demo script, video storyboard, judging mapping, submission checklist. | 10 min |
| 7 | `07-RISKS.md` | Owner + builder. Risks, mitigations, fallbacks. | 5 min |
| 8 | `AGENTS.md` | **Copy to the repo root on day 1.** Rules for every coding agent. Muse Code loads `AGENTS.md` automatically. | 5 min |
| 9 | `.env.example` | **Copy to the repo root on day 1.** Every env var, no real values. | 1 min |
| 10 | `diagrams/*.html` | Anyone. Interactive diagrams: system architecture, main request sequence, DB ERD. Open in a browser. | 3 min |

## Diagrams
- `diagrams/architecture.html` — components, boundaries, external services.
- `diagrams/diagnose-sequence.html` — the main flow: submit code → diagnose → stress test → hint ladder → walkthrough.
- `diagrams/erd.html` — every table and column of the SQLite schema.
- PNG screenshots of each are next to them (`*.png`) for quick viewing; the Archify JSON sources are in `diagrams/source/`.
- `examples/` holds the two worked-example C++ programs (student + brute) and their real run results.

## Day-1 checklist for the builder (copy into the first issue)
1. Create the repo (public, MIT) and copy `AGENTS.md`, `.env.example`, and this pack into `docs/`.
2. Read `01-PLAN.md`, then `05-BUILD-PLAN.md` PR-01..PR-03.
3. Put a real `MODEL_API_KEY` only in `.env.local` (git-ignored). Run `npm run smoke:meta` (PR-02) before anything else.
4. Never add a feature that is not in `02-PRD.md` without the owner's OK.

## Privacy note
This pack intentionally contains no personal names. The repo, commits, and README must not contain the owner's real name unless the owner says so.
