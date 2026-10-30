import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runEval } from "@/scripts/eval";
import { EvalEnvSchema } from "@/src/env";
import example from "@/tests/fixtures/llm/diagnosis-a.json";
import record from "@/tests/fixtures/llm/eval-synthetic-call.json";
import { createFakeFetch, noNetworkFetch } from "../llm/fake-fetch";

let resultsDir: string;
const env = { MODEL_API_KEY: "test-key", MODEL_API_BASE_URL: "https://meta.test/v1" };
const now = () => Date.UTC(2026, 9, 30, 12, 34);
const read = (ext: string) => readFileSync(join(resultsDir, `2026-10-30-1234.${ext}`), "utf8");
beforeEach(() => {
  vi.stubGlobal("fetch", noNetworkFetch);
  resultsDir = mkdtempSync(join(tmpdir(), "daleel-eval-"));
});
afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(resultsDir, { recursive: true, force: true });
});
it.each([undefined, ""])("returns 2 without key %s, requests or files", async (key) => {
  const print = vi.fn();
  const fetch = vi.fn(noNetworkFetch);
  expect(await runEval([], { MODEL_API_KEY: key }, { print, fetch, resultsDir })).toBe(2);
  expect(print).toHaveBeenCalledWith(
    expect.stringMatching(/MODEL_API_KEY is not set.*\.env\.local/),
  );
  expect(fetch).not.toHaveBeenCalled();
  expect(readdirSync(resultsDir)).toEqual([]);
});
it("formats streamed scores and saves full results with selection/effort applied", async () => {
  // Synthetic transport fixture: includes an invalid line range and cached/reasoning usage.
  const sse = readFileSync("tests/fixtures/llm/eval-synthetic.sse", "utf8");
  const fake = createFakeFetch([{ status: 200, sse }]);
  const print = vi.fn();
  const cfg = { ...env, MODEL_DIAGNOSE: "muse-spark-1.3-contributor" };
  const args = ["--only", "cf-4A", "--effort", "low"];
  const deps = { fetch: fake.fetch, print, resultsDir, now };
  expect(await runEval(args, cfg, deps)).toBe(0);
  expect(fake.requests).toHaveLength(1);
  expect(fake.requests[0].body).toMatchObject({
    stream: true,
    reasoning_effort: "low",
    model: cfg.MODEL_DIAGNOSE,
    prompt_cache_key: "problem:4A",
  });
  const output = print.mock.calls.flat().join("\n");
  for (const text of [
    "| id | expected | got | confidence | classOk | lineOverlap | mentions | latency ms | reasoning tokens | cost $ |",
    "| cf-4A | edge_case | edge_case | 0.93 | true | true |",
    "35 | 0.000016",
    "Total cost: $0.000016",
    "counterexample: n/a",
  ])
    expect(output).toContain(text);
  const report = JSON.parse(read("json"));
  const result = report.results[0];
  expect(result.diagnosis.lines).toEqual(example.lines);
  expect(result.diagnosis.root_cause_internal).toBe(example.root_cause_internal);
  expect(result.records[0].reasoningTokens).toBe(35);
  expect(report.totals).toMatchObject({ cases: 1, counterexample: "n/a" });
  expect(read("md")).toContain(output);
  expect(output + read("json")).not.toContain(env.MODEL_API_KEY);
});
it.each(["0", "0.01"])("caps calls at %s and saves partial results", async (cap) => {
  const call = vi.fn();
  const print = vi.fn();
  const status = await runEval(
    ["--only", "cf-4A,cf-1A"],
    { ...env, EVAL_MAX_USD: cap },
    {
      print,
      resultsDir,
      now,
      createClient: (deps) => ({
        callStructured: async (_cfg, _messages, opts) => {
          call();
          await deps.logCall({ ...record, step: "diagnose", status: "ok" });
          return opts.zod.parse(example);
        },
      }),
    },
  );
  expect(status).toBe(1);
  expect(call).toHaveBeenCalledTimes(cap === "0" ? 0 : 1);
  expect(print.mock.calls.flat().join("\n")).toContain("EVAL_MAX_USD");
  expect(JSON.parse(read("json")).totals.cases).toBe(cap === "0" ? 0 : 1);
});
it.each([
  ["--only", "missing"],
  ["--effort", "xhigh"],
  ["--effort", ""],
  ["--only"],
  ["--other", "x"],
])("rejects args %j", async (...args) => {
  const fetch = vi.fn(noNetworkFetch);
  const createClient = () => {
    throw new Error("Invalid args must fail before client creation");
  };
  expect(await runEval(args, env, { fetch, print: vi.fn(), resultsDir, createClient })).toBe(2);
  expect(fetch).not.toHaveBeenCalled();
});
it("validates the budget env with a $1 default", () => {
  expect(EvalEnvSchema.parse({}).EVAL_MAX_USD).toBe(1);
  for (const value of ["-1", "NaN", "Infinity", ""])
    expect(EvalEnvSchema.safeParse({ EVAL_MAX_USD: value }).success).toBe(false);
});
it("blocks repair retries when a paid response reaches the cap", async () => {
  const sse = readFileSync("tests/fixtures/llm/eval-synthetic.sse", "utf8");
  const truncated = sse.replace('"finish_reason": "stop"', '"finish_reason": "length"');
  const fake = createFakeFetch([
    { status: 200, sse: truncated },
    { status: 200, sse },
  ]);
  const cfg = { ...env, EVAL_MAX_USD: "0.0001" };
  const deps = { fetch: fake.fetch, print: vi.fn(), resultsDir, now };
  const status = await runEval(["--only", "cf-4A,cf-1A"], cfg, deps);
  expect(status).toBe(1);
  expect(fake.requests).toHaveLength(1);
  expect(JSON.parse(read("json")).totals.costUsd).toBeCloseTo(0.0002935, 7);
});
