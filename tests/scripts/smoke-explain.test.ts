import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { chatCompletion, createFakeFetch, noNetworkFetch } from "@/tests/llm/fake-fetch";
import diagnosis from "@/tests/fixtures/llm/diagnosis-a.json";
import ladder from "@/tests/fixtures/llm/ladder-a.json";
import explanation from "@/tests/fixtures/llm/explanation-a.json";

async function script() {
  const path = resolve("scripts/smoke-explain.ts");
  expect(existsSync(path), "Explain smoke behavior is missing").toBe(true);
  return (await import(path)) as typeof import("@/scripts/smoke-explain");
}
beforeEach(() => vi.stubGlobal("fetch", noNetworkFetch));
afterEach(() => vi.unstubAllGlobals());
it("exits 2 without a key and never fetches", async () => {
  const fetch = vi.fn(noNetworkFetch),
    print = vi.fn();
  expect(await (await script()).runSmokeExplain("4A", {}, { fetch, print })).toBe(2);
  expect(fetch).not.toHaveBeenCalled();
});
it("diagnoses, reveals three hints and explains through services using fake transport", async () => {
  const stream = (value: unknown) => ({
    status: 200,
    sse: `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: JSON.stringify(value) }, finish_reason: "stop" }], usage: chatCompletion("").usage })}\n\ndata: [DONE]\n\n`,
  });
  const fake = createFakeFetch([
    stream(diagnosis),
    { status: 200, json: chatCompletion(JSON.stringify(ladder)) },
    stream(explanation),
  ]);
  const print = vi.fn();
  expect(
    await (
      await script()
    ).runSmokeExplain("4A", { MODEL_API_KEY: "test-key" }, { fetch: fake.fetch, print }),
  ).toBe(0);
  expect(fake.requests).toHaveLength(3);
  expect(fake.requests[2].body).toMatchObject({
    stream: true,
    reasoning_effort: "medium",
    max_completion_tokens: 16000,
  });
  const output = print.mock.calls.flat().join("\n");
  for (const text of [explanation.explanation_md, explanation.fix[0].new, "frames: 4", "cost_usd="])
    expect(output).toContain(text);
  expect(output).not.toContain("test-key");
});
