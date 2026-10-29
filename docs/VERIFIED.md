# Verified facts about external services

Record here every external fact confirmed by a test or an official answer (date, how it was checked). Items still marked [UNVERIFIED] in `03-ARCHITECTURE.md` §5.2 move here once checked in PR-02.

| Date (Cairo) | Fact | How verified |
|---|---|---|
| 2026-10-29 | $150 hackathon credits are active on the Meta Model API Billing page. | Owner screenshot of the Billing page. |
| 2026-10-29 | API key creation currently fails on Meta's side ("Could not load API keys", "Failed to create API key"); Meta is investigating intermittent failures across accounts. | Owner screenshots of the API keys page and the hackathon Discord. |
| 2026-10-29 | $150 credits are valid only for the 10-day development window, not the judging period. | Organizer answer in the hackathon Discord. |
| 2026-10-29 | Judges run the project from the public repo + 3-minute video; no hosted version or judge keys; recorded sample runs accepted with provenance; never commit your own key. | Organizer answer in the hackathon Discord. |
| 2026-10-29 | A working Meta Model API key exists (kept only in the environment / git-ignored `.env.local`, never in the repo). | Live call, HTTP 200. |
| 2026-10-29 | `POST /v1/chat/completions` with `muse-spark-1.3`, Bearer auth, `reasoning_effort:"low"`, `response_format:{type:"json_schema", json_schema:{strict:true, schema:<zod → JSON Schema>}}` returns schema-valid JSON (`{"ok":true,"model_says":"Hello!"}`); ~1.5 s latency for a tiny prompt. `response_format:{type:"json_object"}` also works. | `pnpm smoke:meta` (PR-02), exit 0; cost $0.00094. |
| 2026-10-29 | **Reasoning tokens are included in `usage.completion_tokens`** (smoke: completion 197, of which `completion_tokens_details.reasoning_tokens` 175). Billed output therefore includes reasoning. Resolves §5.2 item 1. | `pnpm smoke:meta` usage line. |
| 2026-10-29 | Even `reasoning_effort:"low"` uses ~175–205 reasoning tokens on a trivial prompt; `max_completion_tokens:200` ended with `finish_reason:"length"` and `content:null`. The client treats `length` as retryable once with a doubled budget, then throws `OutputTruncated`; small calls use ≥ 4,000. | Parent-agent live probe + smoke run. |
| 2026-10-29 | **`stream:true` + `json_schema` strict works**: content arrives as JSON text deltas that parse after accumulation; `stream_options:{include_usage:true}` yields a final usage chunk (prompt 80, completion 229, reasoning 205). Resolves §5.2 item 2. | One-off streamed call through `callStructured` (not committed), HTTP 200, 1.1 s. |
| 2026-10-29 | Usage field paths: `usage.prompt_tokens_details.cached_tokens` and `usage.completion_tokens_details.reasoning_tokens` are present (cached = 0 on these tiny prompts; a real cache hit is still to be observed in PR-09). | Smoke + stream runs. |
