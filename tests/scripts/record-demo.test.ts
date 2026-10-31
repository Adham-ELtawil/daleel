import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { chatCompletion, createFakeFetch, noNetworkFetch } from "@/tests/llm/fake-fetch";
import diagnosis from "@/tests/fixtures/llm/diagnosis-a.json";
import ladder from "@/tests/fixtures/llm/ladder-a.json";
import diagnosisB from "@/tests/fixtures/llm/diagnosis-b.json";
import ladderB from "@/tests/fixtures/llm/ladder-b.json";
import explanation from "@/tests/fixtures/llm/explanation-a.json";
import explanationB from "@/tests/fixtures/llm/explanation-b.json";
import { tempDb } from "@/tests/db/helpers";
import { seed } from "@/src/db/seed";
import { createMetaClient } from "@/src/llm/meta-client";
import { attempts, stressRuns, walkthroughs } from "@/src/db/schema";
import { fakeStressRunner } from "@/tests/runner/stress-fake";
import stressPlan from "@/tests/fixtures/llm/stress-a.json";

vi.mock("@/src/runner/local", () => ({
  createLocalRunner: () => ({ ...fakeStressRunner(), name: "local" }),
}));

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
it.each(["none", "local"])(
  "runDemoFlows unlocks, records and replays explain for each example with runner %s and no replay key",
  async (provider) => {
    const env = { RUNNER_PROVIDER: provider, EFFORT_STRESS: "low", EFFORT_EXPLAIN: "low" };
    const stress = provider === "local" ? [stream(stressPlan)] : [];
    const fixed = {
      ...diagnosis,
      bug_found: false,
      bug_class: "none",
      lines: [],
      suspect_inputs: [],
    };
    const fake = createFakeFetch([
      stream(diagnosis),
      ...stress,
      { status: 200, json: chatCompletion(JSON.stringify(ladder)) },
      stream(fixed),
      { status: 200, json: chatCompletion(JSON.stringify(ladder)) },
      stream(diagnosisB),
      ...stress,
      { status: 200, json: chatCompletion(JSON.stringify(ladderB)) },
      stream({ ...diagnosis, bug_class: "off_by_one" }),
      ...stress,
      { status: 200, json: chatCompletion(JSON.stringify(ladder)) },
    ]);
    const explanations = createFakeFetch([
      stream(explanation),
      stream(explanationB),
      stream(explanation),
    ]);
    const steps: string[] = [];
    const transport: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      const body = z
        .object({
          response_format: z.object({ json_schema: z.object({ name: z.string() }) }),
        })
        .parse(await request.clone().json());
      const name = body.response_format.json_schema.name;
      steps.push(name);
      return (name === "Explanation" ? explanations : fake).fetch(request);
    };
    const print = vi.fn<(line: string) => void>();
    const { runRecordDemo: run, runDemoFlows } = await runner();
    expect(
      await run(
        { ...env, MODEL_API_KEY: "test-key" },
        { fetch: transport, print, recordingsDir: dir },
      ),
    ).toBe(0);
    expect(
      explanations.requests,
      "Each demo needs its explanation and walkthrough recording",
    ).toHaveLength(3);
    for (const request of explanations.requests) {
      expect(request.body.reasoning_effort).toBe("low");
      expect(request.body.stream).toBe(true);
    }
    expect(steps.filter((step) => step !== "StressPlan")).toEqual([
      "Diagnosis",
      "HintLadder",
      "Explanation",
      "Diagnosis",
      "HintLadder",
      "Diagnosis",
      "HintLadder",
      "Explanation",
      "Diagnosis",
      "HintLadder",
      "Explanation",
    ]);
    const count = provider === "local" ? 14 : 11;
    expect(fake.requests).toHaveLength(count - 3);
    expect(JSON.stringify(fake.requests[2 + stress.length].body.messages)).toContain(
      "w % 2 == 0 && w > 2",
    );
    expect(JSON.stringify(fake.requests[4 + stress.length].body.messages)).toContain(
      "Egyptian Arabic",
    );
    expect(JSON.stringify(fake.requests[6 + 2 * stress.length].body.messages)).toContain(
      "abc300_a",
    );
    if (provider === "local") expect(fake.requests[1].body.reasoning_effort).toBe("low");
    const files = readdirSync(dir, { recursive: true }).filter((name) =>
      String(name).endsWith(".json"),
    );
    expect(files).toHaveLength(count);
    expect(files.filter((name) => String(name).startsWith("explain/"))).toHaveLength(3);
    expect(files.filter((name) => String(name).startsWith("stress/"))).toHaveLength(
      provider === "local" ? 3 : 0,
    );
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
      await runDemoFlows(db.db, client, env);
      expect(fetch).not.toHaveBeenCalled();
      expect(logs).toHaveLength(count);
      const runs = await db.db.select().from(stressRuns);
      expect(runs).toHaveLength(provider === "local" ? 3 : 0);
      if (provider === "local") expect(runs.some((run) => run.status === "verified")).toBe(true);
      const traces = await db.db.select().from(walkthroughs);
      expect(traces).toHaveLength(3);
      expect(traces.map((row) => JSON.parse(row.traceJson).frames.length)).toEqual([4, 5, 4]);
      const recordedAttempts = await db.db.select().from(attempts);
      expect(
        recordedAttempts.filter(
          (attempt) => attempt.status === "stuck" || attempt.maxHintLevel >= 3,
        ),
      ).toHaveLength(3);
      expect(logs.every((log) => log.status === "replay" && log.costUsd === 0)).toBe(true);
    } finally {
      db.cleanup();
    }
  },
);
