// Offline regeneration: pnpm exec node --import tsx scripts/build-eval-fixtures.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseCodeforcesHtml } from "@/src/judges/codeforces";
import { parseAtcoderHtml } from "@/src/judges/atcoder";
import sources from "@/tests/fixtures/eval-sources.json";

for (const { id, source, externalId } of sources) {
  const html = readFileSync(`tests/fixtures/${source}.html`, "utf8");
  const cf = id.startsWith("cf-");
  const contest = cf ? externalId.slice(0, -1) : "abc303";
  const problem = {
    ...(cf ? parseCodeforcesHtml(html) : parseAtcoderHtml(html)),
    judge: cf ? "codeforces" : "atcoder",
    externalId,
    url: cf
      ? `https://codeforces.com/problemset/problem/${contest}/${externalId.slice(-1)}`
      : `https://atcoder.jp/contests/${contest}/tasks/${externalId}`,
    contestId: contest,
    rating: null,
    tags: [],
  };
  const dir = `tests/fixtures/eval/${id}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/problem.json`, JSON.stringify(problem, null, 2) + "\n");
}
