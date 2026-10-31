import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Runner } from "@/src/runner/runner";
import { chatCompletion, createFakeFetch, noNetworkFetch } from "@/tests/llm/fake-fetch";
import { fakeStressRunner } from "@/tests/runner/stress-fake";
import diagnosis from "@/tests/fixtures/llm/diagnosis-a.json";
import ladder from "@/tests/fixtures/llm/ladder-a.json";
import plan from "@/tests/fixtures/llm/stress-a.json";

async function script() {
  const path = resolve("scripts/smoke-stress.ts");
  expect(existsSync(path), "stress smoke behavior is missing").toBe(true);
  const exports: {
    runSmokeStress: (
      id: string,
      env: Record<string, string | undefined>,
      deps: { fetch?: typeof fetch; print?: (line: string) => void; runner?: Runner },
    ) => Promise<number>;
  } = await import(path);
  return exports.runSmokeStress;
}
beforeEach(() => vi.stubGlobal("fetch", noNetworkFetch));
afterEach(() => vi.unstubAllGlobals());
it.each([undefined, ""])("exits 2 without a key %s and never fetches", async (key) => {
  const fetch = vi.fn(noNetworkFetch),
    print = vi.fn();
  expect(
    await (
      await script()
    )("4A", { MODEL_API_KEY: key, RUNNER_PROVIDER: "local" }, { fetch, print }),
  ).toBe(2);
  expect(print).toHaveBeenCalledWith(
    expect.stringMatching(/MODEL_API_KEY is not set.*\.env\.local/),
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("requires the local provider before any model request", async () => {
  const fetch = vi.fn(noNetworkFetch),
    print = vi.fn();
  expect(
    await (
      await script()
    )("4A", { MODEL_API_KEY: "test-key", RUNNER_PROVIDER: "none" }, { fetch, print }),
  ).toBe(2);
  expect(print).toHaveBeenCalledWith(expect.stringContaining("RUNNER_PROVIDER=local"));
  expect(fetch).not.toHaveBeenCalled();
});
it("runs the service pipeline on a temporary DB with fake transport and runner", async () => {
  const stream = (value: unknown) => ({
    status: 200,
    sse: `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: JSON.stringify(value) }, finish_reason: "stop" }], usage: chatCompletion("").usage })}\n\ndata: [DONE]\n\n`,
  });
  const fake = createFakeFetch([
    stream(diagnosis),
    stream(plan),
    { status: 200, json: chatCompletion(JSON.stringify(ladder)) },
  ]);
  const print = vi.fn();
  expect(
    await (
      await script()
    )(
      "4A",
      { MODEL_API_KEY: "test-key", RUNNER_PROVIDER: "local" },
      { fetch: fake.fetch, print, runner: fakeStressRunner() },
    ),
  ).toBe(0);
  const output = print.mock.calls.flat().join("\n");
  for (const text of [
    "status: verified",
    "failing_input: 2",
    "expected_output: NO",
    "actual_output: YES",
    "source: test",
    "contradiction: false",
    "calls: 3",
    "cost_usd=",
  ])
    expect(output).toContain(text);
  expect(fake.requests).toHaveLength(3);
  expect(output).not.toContain("test-key");
  expect(output).not.toContain(plan.brute_cpp);
});
