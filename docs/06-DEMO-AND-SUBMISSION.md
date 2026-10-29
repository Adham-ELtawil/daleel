# Daleel — Demo, video and submission

## 1. What the rules say (from `event-details-raw.md`, the official rules and the CV platform)
| Item | Requirement | Source |
|---|---|---|
| Deadline | Nov 4, 9:00 PM ET = **Nov 5, 04:00 Cairo** (event `endDate` 2026-11-05T02:00:00Z) | rules + event structured data |
| Where | https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit | Official Rules, Event Overview |
| Models | Build with Meta AI products: Muse Spark series, Muse Wonder, Muse Image, SAM 3.1 via Meta Model API; Meta open-weight models; Muse Code | main page "About" + rules |
| Track | One track per project. **Indie developer track** (students, teams up to 4) fits. Representative submits and lists all teammates. | rules |
| Themes | "Build for Your World" (our fit) or "Push the Frontier" | main page |
| Judging | Impact 30% · Use of Meta AI tooling 25% · Technical depth & execution 20% · Demo 25% (working, impressive, "holds up live", **quality of the demo video**) | rules |
| Ownership | Original work; open-source allowed if licenses are followed and the project builds on it; third-party help allowed if you own the result | rules, Hackathon Submission |
| License to organizers | Submission is licensed to organizers for marketing/demo use | rules |
| Credits | $150 Meta Model API credits; optional; claim by Nov 4, 9 PM ET; spending beyond credits never required | Credit Terms |
| Late | The CV form supports late submission ("This project will be marked late. Hosts may consider that during judging."); changing the repository after the deadline marks the project late | CV platform UI strings (not event-specific) |
| Submission form fields | **Inferred from the CV platform UI (not the event page):** Team Name, Team Members (search approved attendees, up to 10 extra), Project Description, GitHub Repository (a "No GitHub" option exists), Demo Video, Live Project link. Drafts auto-save; "Update Project" allowed before the deadline. | CV JS bundle strings, Oct 26 capture |
| **Unknown (gated behind login)** | Video max length, required video host, whether the repo must be public, problem-statement list, any required Meta-model usage proof | Details page needs login — **owner must screenshot** |

Defaults until the Details page says otherwise: video **≤ 3:00** (aim 2:30), hosted on **YouTube (unlisted) or Loom**, repo **public** with MIT license, live URL working without login.

## 2. Judging-criteria mapping
| Criterion (weight) | What judges look for | What we show | Where in the video |
|---|---|---|---|
| **Impact 30%** | Who benefits, how much, would people use it, fits a theme | Arabic-first CP community; a real training group of ~100 trainees; the coach report; the "no spoiler" learning contract; contest-integrity guard | 0:00–0:25 problem, 2:05–2:20 coach + roll-out plan |
| **Use of Meta AI tooling 25%** | Creative use, beyond basic integration, unexpected capabilities | Muse Spark with **per-step reasoning effort**, **schema-constrained JSON** for every step, **model writes a brute force that we execute** to verify its own diagnosis and self-correct, prompt caching per problem, Egyptian-Arabic generation with English terms, (S) **Muse Voice Transcribe** in Arabic for rubber-duck, (S) image understanding of statement screenshots, **built with Muse Code** | 0:40–1:40 + 2:20–2:35 "under the hood" card |
| **Technical depth 20%** | Sound engineering, refinement, craft | Sandboxed execution with a trust gate on samples, validators (no-spoiler, ids-in-candidates), eval harness score table, cost per attempt + budget guard, replay mode, tests/CI | 2:20–2:35 + README |
| **Demo 25%** | Works live, impressive, holds up; video quality | 3 seeded examples that never fail; live deployed URL; one "wow" moment (verified counterexample + walkthrough); clean edited video with captions | whole video |

## 3. Live demo script (≈ 4 minutes, for a live finals or a judge call)
Setup: deployed URL open, logged out, Arabic UI, browser zoom 110%, notifications off, `DEMO_REPLAY` **off** (switch on only if `/api/health` says `meta: down`).
1. **(20 s) Hook.** "A trainee gets *Wrong Answer on test 9* and has no idea why. Editorials spoil the problem; chatbots spoil it too, in English, and are often wrong about the bug."
2. **(40 s) Submit.** Try the demo → paste `https://codeforces.com/problemset/problem/1/A` → title + samples appear → paste the `int` solution → verdict `WA on test 9` → Diagnose. Narrate the progress stages.
3. **(40 s) Verified.** Result card: "فكرتك صح، بس فيه مشكلة في حجم الأرقام" + line 8 highlighted + **Verified counterexample**: `100000 100000 1` → expected `10000000000`, yours `1410065408`. Say: "The model wrote a brute force; we ran both programs in a sandbox; this is a real failing input, not a guess."
4. **(40 s) Hint ladder.** Reveal Hint 1 and 2 in Egyptian Arabic; switch to English and back to show the same ladder in both languages.
5. **(40 s) Stuck → walkthrough.** Press "I'm stuck" → Full explanation → Watch walkthrough: frames step to `x * y` overflowing `INT_MAX`.
6. **(20 s) Re-check.** "I fixed it" → change to `long long` → re-check → "No bug found".
7. **(40 s) Coach.** Coach view of team DEMO: weak topics this week, trainees needing attention, 5 real Codeforces problems, 90-minute session plan.
8. **(20 s) Close.** "Built on Muse Spark, built *with* Muse Code. Next: our own 100-trainee group at our university from next week."
Backup: if the live API fails, switch `DEMO_REPLAY=1` (badge visible) and say so.

## 4. Demo video storyboard (target 2:30, hard max 3:00)
| Time | Visual | Voice-over (English, with Arabic UI on screen) | On-screen text |
|---|---|---|---|
| 0:00–0:08 | Codeforces verdict page "Wrong answer on test 9" (own account or recreated), zoom | "Every competitive programmer knows this screen." | "Wrong answer on test 9" |
| 0:08–0:25 | Fast cuts: editorial (blurred), generic chatbot dumping full code (blurred), a training room | "Editorials and chatbots give you the answer, not the understanding. And for Arab students, not in the language they think in." | "Learn the bug, not the answer" |
| 0:25–0:35 | Logo + one line; optional 4-second Manim intro (owner's Manim style) of a hint ladder | "Daleel is an AI training coach built on Meta's Muse Spark." | "Daleel · built with Muse Spark + Muse Code" |
| 0:35–0:55 | Screen: paste CF 1A link + code, press Diagnose, progress stages | "Paste the problem and your code." | stage names |
| 0:55–1:15 | Result card + Verified counterexample box (highlight with zoom) | "Muse Spark finds the bug, then writes a brute force. We run both programs in a sandbox, so this failing input is verified, not guessed." | "Verified by running your code" |
| 1:15–1:40 | Hint 1 → 2 → 3 in Egyptian Arabic, quick toggle to English | "Hints climb a ladder: a nudge, the concept, the exact line. Egyptian Arabic or English, technical terms stay in English." | "4-step hint ladder · no spoilers" |
| 1:40–2:00 | "I'm stuck" → walkthrough animation of the overflow | "Stuck? An animated walkthrough of *your* code on the failing input." | "Your code, step by step" |
| 2:00–2:15 | Coach dashboard + weekly report, recommended problems | "Coaches get a weekly weak-topic report with real Codeforces problems to practise next." | "For coaches of 100+ trainees" |
| 2:15–2:30 | Architecture diagram (from `diagrams/architecture.html`) + eval table + cost per attempt | "Under the hood: schema-constrained Muse Spark steps with tuned reasoning effort, sandboxed execution, an eval set, about five cents per attempt." | "8/10 bugs found on our eval set" (use the real number) |
| 2:30–2:40 | Trainees (with consent) or the training hall; URL + repo | "We start with our own university training group next week." | live URL + GitHub |
Production notes: 1080p, 30 fps, cursor highlight, zoom-ins on key boxes, subtitles burned in (English) — Arabic UI text is visible on screen; background music low; record voice separately; no personal names or faces without consent; no API keys/billing pages on screen.

## 5. Submission checklist (do in this order on Nov 4)
- [ ] Deployed URL works logged-out on a phone and a laptop; `/api/health` all ok.
- [ ] 3 demo examples pass 3 times in a row.
- [ ] Repo public, MIT `LICENSE`, no secrets (`git log -p | grep -iE "api[_-]?key|sk-|bearer"` clean; GitHub secret scanning on), `.env.example` present.
- [ ] README: one-line pitch, problem, demo URL, video URL, screenshots, **how Meta models are used (list each step + model + reasoning effort)**, Muse Code usage note, architecture diagram, setup (`pnpm i`, env, migrate, seed, dev), eval results table, cost per attempt, known limits, license, credits to open-source libs.
- [ ] Video ≤ 3:00 (or the limit on the Details page), plays logged-out, link set to "unlisted" not "private".
- [ ] CV form: Team Name; Team Members (all teammates added); Project Description (paste from below); GitHub Repository; Demo Video; Live Project link; track = **Indie developer**.
- [ ] Credits claimed before Nov 4 9 PM ET (already done) — check the Billing page that usage did not pass $150; spend notification set.
- [ ] Screenshot "Project submitted".
- [ ] Do **not** change the repository link after 04:00 Cairo.

### Project description draft (≤ 150 words; edit freely)
> Daleel is an AI training coach for Arab competitive programmers. Paste a Codeforces or AtCoder problem and your own code: Meta's Muse Spark diagnoses the real root cause, then writes a brute-force reference that we run against your code in a sandbox, so you get a **verified failing input**, not a guess. You climb a 4-step hint ladder (nudge, concept, exact line, full explanation) in Egyptian Arabic or English, and only when you're stuck you get an animated walkthrough of your own code. Coaches get a weekly weak-topic report with real Codeforces problems to practise next. Every step is schema-constrained Muse Spark with tuned reasoning effort, prompt caching per problem, an eval set and a budget guard; optional Arabic voice "rubber-duck" via Muse Voice Transcribe. Built with Muse Code for a university ICPC training community of ~100 trainees.
