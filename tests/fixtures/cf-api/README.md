# Codeforces fixture provenance

The original eight problem rows and all `problemStatistics` rows in `problemset.problems.json` retain the trimmed PR-07 recording fetched on 2026-10-29, as recorded in `docs/VERIFIED.md`.

PR-20 appends five manually curated entries for existing Codeforces problems: 50A, 231A, 617A, 318A and 122A. These supply unused problems in the DEMO team's rating band. Their metadata is an offline catalogue supplement, **not a newly recorded API response**; no solved counts were invented. Live revalidation against `https://codeforces.com/api/problemset.problems` and the problem links could not run because `codeforces.com` did not resolve in the sandbox. Update 2026-10-31: all five rows (name, rating, tags) were checked against a live `problemset.problems` response from outside the sandbox and match exactly.
