import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { chatCompletion, createFakeFetch, noNetworkFetch } from "@/tests/llm/fake-fetch";
import diagnosis from "@/tests/fixtures/llm/diagnosis-a.json";
import ladder from "@/tests/fixtures/llm/ladder-a.json";

type SmokeRunner = (
  id: string,
  env: Record<string, string | undefined>,
  deps: { fetch?: typeof fetch; print?: (line: string) => void },
) => Promise<number>;
async function runner(): Promise<SmokeRunner> {
  const script = resolve("scripts/smoke-recheck.ts");
  expect(existsSync(script), "PR-13 re-check smoke script is missing").toBe(true);
  const scriptExports: { runSmokeRecheck: SmokeRunner } = await import(script);
  return scriptExports.runSmokeRecheck;
}
beforeEach(() => vi.stubGlobal("fetch", noNetworkFetch));
afterEach(() => vi.unstubAllGlobals());
it.each([undefined, ""])("exits 2 without a key and never requests the model", async (key) => {
  const print = vi.fn<(line: string) => void>();
  const fetch = vi.fn(noNetworkFetch);
  expect(await (await runner())("4A", { MODEL_API_KEY: key }, { fetch, print })).toBe(2);
  expect(print).toHaveBeenCalledWith(
    expect.stringMatching(/MODEL_API_KEY is not set.*\.env\.local/),
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("runs both diagnoses and four reveals through a temp DB with fake transport, reporting calls and cost", async () => {
  const fixed = {
    ...diagnosis,
    bug_found: false,
    bug_class: "none",
    lines: [],
    suspect_inputs: [],
  };
  const stream = (result: unknown) => ({
    status: 200,
    sse: `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: JSON.stringify(result) }, finish_reason: "stop" }], usage: chatCompletion("").usage })}\n\ndata: [DONE]\n\n`,
  });
  const fake = createFakeFetch([
    stream(diagnosis),
    { status: 200, json: chatCompletion(JSON.stringify(ladder)) },
    stream(fixed),
    { status: 200, json: chatCompletion(JSON.stringify(ladder)) },
  ]);
  const print = vi.fn<(line: string) => void>();
  expect(
    await (
      await runner()
    )("4A", { MODEL_API_KEY: "test-key" }, { fetch: fake.fetch, print }),
  ).toBe(0);
  expect(fake.requests).toHaveLength(4);
  expect(JSON.stringify(fake.requests[2].body.messages)).toContain("w % 2 == 0 && w > 2");
  const output = print.mock.calls.map(([line]) => line).join("\n");
  for (const text of [
    ...ladder.levels.map((hint) => hint.title),
    "bug_found: false",
    "bug_class: none",
    "confidence:",
    "calls: 4",
    "cost_usd=0.001174",
  ])
    expect(output).toContain(text);
  for (const secret of [
    "test-key",
    diagnosis.root_cause_internal,
    diagnosis.fix_internal,
    "_internal",
  ])
    expect(output).not.toContain(secret);
});
