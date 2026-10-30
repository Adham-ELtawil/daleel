# Demo replay — PR-22A

Replay is a first-class local judging path (DECISIONS D4/D5). It never contacts
Meta, requires no API key, and has zero LLM cost. A missing recording throws
`ReplayMiss`; it never silently falls back to a live call. Responses pass the
same zod and domain validators as live responses. `llm_calls.status` is `replay`
with zero cost and token usage; original usage remains in the recording.

Recordings belong in `recordings/<step>/<requestHash>.json` and may be committed
after review. Each contains `response` (parsed JSON) and `provenance`: ISO UTC
`recordedAt`, model, reasoning effort, step, request hash, input/output/cached/
reasoning token usage, USD cost, latency in ms, and `tool: "pnpm record:demo"`.
Provenance describes the successful response-producing call; retries are logged
separately and included in the script's total cost. Test fakes are not live-run
provenance and must not be presented as genuine Meta recordings.

The SHA-256 hash uses model, reasoning effort, schema name, generated schema, and
messages. It excludes keys, cache keys, user/attempt/problem database IDs and
timestamps. The problem prompt uses the judge's external ID. Different code,
verdict, note, locale, prompt, schema, or model settings require a new recording.

With genuine recordings present, judges can run without a key:

```sh
pnpm db:migrate
pnpm db:seed
DEMO_REPLAY=1 pnpm dev
```

Paste the exact `student.cpp` from `docs/examples/cf-4A-watermelon` (English),
`cf-1A-theatre-square` (Egyptian Arabic), or `atcoder-abc300_a` (English) for the
corresponding seeded problem. Leave verdict, test number, and note unset. The 4A
`fixed.cpp` also has a re-check recording. Keep MODEL/EFFORT settings identical
to the recording run. `GET /api/health` reports `replay: true` in this mode.

To re-record with your own key in the ignored `.env.local`:

```sh
DEMO_REPLAY=0 RECORD_MAX_USD=0.50 pnpm record:demo
```

The script enables `DEMO_RECORD=1`, migrates/seeds a temporary database, runs
diagnose and ladder for all three examples, then also re-checks fixed 4A code.
It removes the temporary DB, prints per-call and total costs, and exits 2 without
a key or valid configuration. Record mode reserves uncached input at one token
per UTF-8 byte plus envelope overhead and maximum completion tokens before
each request, including repair/truncation retries. It refuses calls that would
exceed the remaining RECORD_MAX_USD or DAILY_BUDGET_USD allowance under the
repo's price table. No tokenizer or billing behaviour was verified live here.
Model content echoing the API key is rejected before writing a recording.
`DEMO_RECORD=1` is refused in the web runtime: only the script records our examples.

PR-22A was verified entirely offline. Genuine recordings have not been generated
in this change; the owner must run and review `pnpm record:demo` before the public
judge path can replay these examples. PR-22B still needs `/api/session/demo`, home
example selection, public `replay: true` flags, and the translated replay badges.
