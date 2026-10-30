import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { chatCompletion, createFakeFetch, noNetworkFetch } from "@/tests/llm/fake-fetch";
import diagnosis from "@/tests/fixtures/llm/diagnosis-a.json";
import ladder from "@/tests/fixtures/llm/ladder-a.json";
import diagnosisB from "@/tests/fixtures/llm/diagnosis-b.json";
import ladderB from "@/tests/fixtures/llm/ladder-b.json";
import { tempDb } from "@/tests/db/helpers";
import { seed } from "@/src/db/seed";
import { createMetaClient } from "@/src/llm/meta-client";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pr22-record-"));
  vi.stubGlobal("fetch", noNetworkFetch);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});
async function runner() {
  const path = resolve("scripts/record-demo.ts");
  expect(existsSync(path), "PR-22 record:demo flow is missing").toBe(true);
  const mod: typeof import("@/scripts/record-demo") = await import(path);
  return mod;
}
const stream = (response: unknown) => ({
  status: 200,
  sse: `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: JSON.stringify(response) }, finish_reason: "stop" }], usage: chatCompletion("").usage })}\n\ndata: [DONE]\n\n`,
});
it("refuses to run without a key, exiting 2 with no transport calls", async () => {
  const fetch = vi.fn(noNetworkFetch);
  expect(
    await (await runner()).runRecordDemo({}, { fetch, print: vi.fn(), recordingsDir: dir }),
  ).toBe(2);
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["0", "invalid", ""])("rejects invalid cap %s without network", async (cap) => {
  const fetch = vi.fn(noNetworkFetch);
  expect(
    await (
      await runner()
    ).runRecordDemo(
      { MODEL_API_KEY: "test-key", RECORD_MAX_USD: cap },
      { fetch, print: vi.fn(), recordingsDir: dir },
    ),
  ).toBe(2);
  expect(fetch).not.toHaveBeenCalled();
});
it("records all three real service flows and fixed-code re-check; then replays every call with no key", async () => {
  const fixed = {
    ...diagnosis,
    bug_found: false,
    bug_class: "none",
    lines: [],
    suspect_inputs: [],
  };
  const fake = createFakeFetch([
    stream(diagnosis),
    { status: 200, json: chatCompletion(JSON.stringify(ladder)) },
    stream(fixed),
    { status: 200, json: chatCompletion(JSON.stringify(ladder)) },
    stream(diagnosisB),
    { status: 200, json: chatCompletion(JSON.stringify(ladderB)) },
    stream({ ...diagnosis, bug_class: "off_by_one" }),
    { status: 200, json: chatCompletion(JSON.stringify(ladder)) },
  ]);
  const print = vi.fn<(line: string) => void>();
  const { runRecordDemo: run, runDemoFlows } = await runner();
  expect(
    await run({ MODEL_API_KEY: "test-key" }, { fetch: fake.fetch, print, recordingsDir: dir }),
  ).toBe(0);
  expect(fake.requests).toHaveLength(8);
  expect(JSON.stringify(fake.requests[2].body.messages)).toContain("w % 2 == 0 && w > 2");
  expect(JSON.stringify(fake.requests[4].body.messages)).toContain("Egyptian Arabic");
  expect(JSON.stringify(fake.requests[6].body.messages)).toContain("abc300_a");
  const files = readdirSync(dir, { recursive: true }).filter((name) =>
    String(name).endsWith(".json"),
  );
  expect(files).toHaveLength(8);
  for (const name of files)
    expect(readFileSync(join(dir, String(name)), "utf8")).not.toContain("test-key");
  expect(print.mock.calls.map(([line]) => line).join("\n")).toContain("Total cost: $");
  const fetch = vi.fn(noNetworkFetch);
  const db = await tempDb();
  try {
    await seed(db.db);
    const { createReplayStore } = await import("@/src/llm/replay/store");
    const logs: { status: string; costUsd: number }[] = [];
    const client = createMetaClient({
      apiKey: "",
      baseURL: "https://meta.test/v1",
      fetch,
      dailyBudgetUsd: 1,
      getSpentTodayUsd: async () => 0,
      logCall: (log) => {
        logs.push(log);
      },
      replay: { mode: "replay", store: createReplayStore(dir) },
    });
    await runDemoFlows(db.db, client, {});
    expect(fetch).not.toHaveBeenCalled();
    expect(logs).toHaveLength(8);
    expect(logs.every((log) => log.status === "replay" && log.costUsd === 0)).toBe(true);
  } finally {
    db.cleanup();
  }
});
