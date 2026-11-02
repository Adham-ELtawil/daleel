import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createMetaClient,
  jsonSchemaFor,
  SchemaError,
  type LlmCallRecord,
  type MetaClientDeps,
} from "@/src/llm/meta-client";
import { chatCompletion, createFakeFetch, noNetworkFetch } from "@/tests/llm/fake-fetch";

const schema = z.object({ answer: z.string() });
const response = { answer: "fixture response" };
const cfg = {
  step: "diagnose",
  model: "muse-spark-1.3",
  reasoningEffort: "high",
  maxCompletionTokens: 128,
  stream: false,
  schemaName: "Answer",
  schema: jsonSchemaFor(schema),
} as const;
const messages = [{ role: "user", content: "<student_code>int w;</student_code>" }] as const;
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pr22-replay-"));
  vi.stubGlobal("fetch", noNetworkFetch);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});
async function setup(mode: "off" | "record" | "replay", patch: Partial<MetaClientDeps> = {}) {
  const path = resolve("src/llm/replay/store.ts");
  expect(existsSync(path), "PR-22 replay store behaviour is missing").toBe(true);
  const mod: typeof import("@/src/llm/replay/store") = await import(path);
  const store = mod.createReplayStore(dir);
  const fetch = vi.fn(noNetworkFetch);
  const logs: LlmCallRecord[] = [];
  const client = createMetaClient({
    apiKey: "fake-secret-pr22",
    baseURL: "https://meta.test/v1",
    fetch,
    now: () => Date.UTC(2026, 9, 30),
    dailyBudgetUsd: 10,
    getSpentTodayUsd: async () => 0,
    logCall: (record) => {
      logs.push(record);
    },
    replay: { mode, store },
    ...patch,
  });
  return { store, client, logs, fetch, ReplayMiss: mod.ReplayMiss };
}
async function record() {
  const fake = createFakeFetch([{ status: 200, json: chatCompletion(JSON.stringify(response)) }]);
  const s = await setup("record", { fetch: fake.fetch });
  expect(
    await s.client.callStructured(cfg, [...messages], {
      zod: schema,
      userId: "guest-a",
      attemptId: "attempt-a",
    }),
  ).toEqual(response);
  return s;
}
it("records parsed JSON with dated provenance and no API key", async () => {
  const { store, logs } = await record();
  const hash = logs[0].requestHash;
  const text = readFileSync(join(dir, "diagnose", `${hash}.json`), "utf8");
  expect(text).not.toContain("fake-secret-pr22");
  expect(await store.read("diagnose", hash)).toEqual({
    provenance: {
      recordedAt: "2026-10-30T00:00:00.000Z",
      model: cfg.model,
      reasoningEffort: "high",
      step: "diagnose",
      requestHash: hash,
      usage: { input: 100, output: 50, cached: 40, reasoning: 0 },
      costUsd: logs[0].costUsd,
      latencyMs: 0,
      tool: "pnpm record:demo",
    },
    response,
  });
});
it("replays without a key or budget, logs replay and zero cost, and never fetches", async () => {
  await record();
  const { client, logs, fetch } = await setup("replay", {
    apiKey: "",
    getSpentTodayUsd: async () => 100,
  });
  expect(await client.callStructured(cfg, [...messages], { zod: schema })).toEqual(response);
  expect(fetch).not.toHaveBeenCalled();
  expect(logs).toMatchObject([{ status: "replay", costUsd: 0, inputTokens: 0, outputTokens: 0 }]);
});
it("throws typed ReplayMiss on a miss with no network fallback", async () => {
  const { client, fetch, ReplayMiss } = await setup("replay");
  await expect(client.callStructured(cfg, [...messages], { zod: schema })).rejects.toBeInstanceOf(
    ReplayMiss,
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("validates replay responses with the caller's zod schema without repair calls", async () => {
  await record();
  const { client, fetch } = await setup("replay");
  await expect(
    client.callStructured(cfg, [...messages], { zod: z.object({ other: z.string() }) }),
  ).rejects.toBeInstanceOf(SchemaError);
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps the request hash stable across keys, users, attempts, clocks and cache keys", async () => {
  const { logs } = await record();
  const s = await setup("replay", { apiKey: "another-fake-key", now: () => 1 });
  await s.client.callStructured(cfg, [...messages], {
    zod: schema,
    userId: "guest-b",
    attemptId: "attempt-b",
    cacheKey: "random-cache",
  });
  expect(s.logs[0].requestHash).toBe(logs[0].requestHash);
});
it("blocks a record request whose maximum cost exceeds the cap before fetching", async () => {
  const { client, fetch } = await setup("record", { dailyBudgetUsd: 0.000001 });
  await expect(client.callStructured(cfg, [...messages], { zod: schema })).rejects.toMatchObject({
    name: "BudgetReached",
  });
  expect(fetch).not.toHaveBeenCalled();
});
it("refuses to persist an API key echoed in model content", async () => {
  const fake = createFakeFetch([
    { status: 200, json: chatCompletion(JSON.stringify({ answer: "fake-secret-pr22" })) },
  ]);
  const { client, store, logs } = await setup("record", { fetch: fake.fetch });
  await expect(client.callStructured(cfg, [...messages], { zod: schema })).rejects.toBeInstanceOf(
    SchemaError,
  );
  expect(await store.read("diagnose", logs[0].requestHash)).toBeNull();
});
it("record mode with reuse returns an existing recording without a live call", async () => {
  await record();
  const s = await setup("record");
  const client = createMetaClient({
    apiKey: "fake-secret-pr22",
    baseURL: "https://meta.test/v1",
    fetch: s.fetch,
    now: () => Date.UTC(2026, 9, 30),
    dailyBudgetUsd: 10,
    getSpentTodayUsd: async () => 0,
    logCall: () => {},
    replay: { mode: "record", store: s.store, reuse: true },
  });
  await expect(client.callStructured(cfg, [...messages], { zod: schema })).resolves.toEqual(
    response,
  );
  expect(s.fetch).not.toHaveBeenCalled();
});
it("records and replays the translate step with normal Spark pricing and no replay transport", async () => {
  const fake = createFakeFetch([{ status: 200, json: chatCompletion(JSON.stringify(response)) }]);
  const s = await setup("record", { fetch: fake.fetch });
  const translate = { ...cfg, step: "translate" as const };
  expect(await s.client.callStructured(translate, [...messages], { zod: schema })).toEqual(
    response,
  );
  expect(s.logs[0]).toMatchObject({
    step: "translate",
    status: "ok",
    costUsd: (60 * 1.25 + 40 * 0.15 + 50 * 4.25) / 1e6,
  });
  expect(await s.store.read("translate", s.logs[0].requestHash)).toMatchObject({
    provenance: { step: "translate" },
    response,
  });
  const replay = await setup("replay", { apiKey: "" });
  expect(await replay.client.callStructured(translate, [...messages], { zod: schema })).toEqual(
    response,
  );
  expect(replay.fetch).not.toHaveBeenCalled();
  expect(replay.logs[0]).toMatchObject({ step: "translate", status: "replay", costUsd: 0 });
});
