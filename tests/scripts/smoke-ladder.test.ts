import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runSmokeLadder } from "@/scripts/smoke-ladder";
import { chatCompletion, createFakeFetch, noNetworkFetch } from "@/tests/llm/fake-fetch";
import diagnosisA from "@/tests/fixtures/llm/diagnosis-a.json";
import diagnosisB from "@/tests/fixtures/llm/diagnosis-b.json";
import ladderA from "@/tests/fixtures/llm/ladder-a.json";
import ladderB from "@/tests/fixtures/llm/ladder-b.json";

beforeEach(() => vi.stubGlobal("fetch", noNetworkFetch));
afterEach(() => vi.unstubAllGlobals());
it.each([undefined, ""])("exits 2 without a key and makes zero requests", async (key) => {
  const print = vi.fn<(line: string) => void>();
  const fetch = vi.fn(noNetworkFetch);
  expect(await runSmokeLadder("4A", { MODEL_API_KEY: key }, { fetch, print })).toBe(2);
  expect(print).toHaveBeenCalledWith(
    expect.stringMatching(/MODEL_API_KEY is not set.*\.env\.local/),
  );
  expect(fetch).not.toHaveBeenCalled();
});
it.each([
  ["4A", diagnosisA, ladderA],
  ["1A", diagnosisB, ladderB],
] as const)(
  "diagnoses then formats %s ladder and total usage with a fake fetch",
  async (id, diagnosis, ladder) => {
    const completion = chatCompletion(JSON.stringify(diagnosis));
    const fake = createFakeFetch([
      {
        status: 200,
        sse: `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: JSON.stringify(diagnosis) }, finish_reason: "stop" }], usage: completion.usage })}\n\ndata: [DONE]\n\n`,
      },
      { status: 200, json: chatCompletion(JSON.stringify(ladder)) },
    ]);
    const print = vi.fn<(line: string) => void>();
    expect(
      await runSmokeLadder(id, { MODEL_API_KEY: "test-key" }, { fetch: fake.fetch, print }),
    ).toBe(0);
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[1].body).toMatchObject({
      stream: false,
      reasoning_effort: "low",
      max_completion_tokens: 8000,
      prompt_cache_key: `problem:${id}`,
    });
    const output = print.mock.calls.map(([line]) => line).join("\n");
    for (const level of ladder.levels) {
      expect(output).toContain(level.title);
      expect(output).toContain(level.body_md);
    }
    for (const text of [
      "validator:",
      '"ok":true',
      "calls: 2",
      "latency:",
      "prompt_tokens=200",
      "completion_tokens=100",
      "cost_usd=0.000587",
    ])
      expect(output).toContain(text);
    for (const secret of ["test-key", diagnosis.root_cause_internal, diagnosis.fix_internal])
      expect(output).not.toContain(secret);
  },
);
