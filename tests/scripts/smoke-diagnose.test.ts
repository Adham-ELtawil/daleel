import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runSmokeDiagnose } from "@/scripts/smoke-diagnose";
import { createFakeFetch, noNetworkFetch } from "../llm/fake-fetch";
import exampleA from "@/tests/fixtures/llm/diagnosis-a.json";
import exampleB from "@/tests/fixtures/llm/diagnosis-b.json";

beforeEach(() => vi.stubGlobal("fetch", noNetworkFetch));
afterEach(() => vi.unstubAllGlobals());
it.each([undefined, ""])(
  "returns 2 with guidance and makes no request when key is %s",
  async (key) => {
    const print = vi.fn<(line: string) => void>();
    const fetch = vi.fn(noNetworkFetch);
    expect(await runSmokeDiagnose("4A", { MODEL_API_KEY: key }, { fetch, print })).toBe(2);
    expect(print).toHaveBeenCalledWith(
      expect.stringMatching(/MODEL_API_KEY is not set.*\.env\.local/),
    );
    expect(fetch).not.toHaveBeenCalled();
  },
);
it.each([
  ["4A", "watermelon", exampleA],
  ["1A", "theatre-square", exampleB],
] as const)(
  "formats %s diagnosis and streamed usage using a fake fetch",
  async (id, slug, diagnosis) => {
    const chunks = [
      {
        choices: [
          { index: 0, delta: { content: JSON.stringify(diagnosis) }, finish_reason: "stop" },
        ],
      },
      {
        choices: [],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          prompt_tokens_details: { cached_tokens: 40 },
          completion_tokens_details: { reasoning_tokens: 35 },
        },
      },
    ];
    const fake = createFakeFetch([
      {
        status: 200,
        sse:
          chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n",
      },
    ]);
    const print = vi.fn<(line: string) => void>();
    expect(
      await runSmokeDiagnose(
        id,
        { MODEL_API_KEY: "test-key", MODEL_API_BASE_URL: "https://meta.test/v1" },
        { fetch: fake.fetch, print },
      ),
    ).toBe(0);
    const output = print.mock.calls.map(([line]) => line).join("\n");
    for (const value of [
      `bug_class: ${diagnosis.bug_class}`,
      `confidence: ${diagnosis.confidence}`,
      `lines: ${JSON.stringify(diagnosis.lines)}`,
      `public_summary: ${diagnosis.public_summary}`,
      "latency:",
      "prompt_tokens=100",
      "completion_tokens=50",
      "cached_tokens=40",
      "reasoning_tokens=35",
      "cost_usd=0.000294",
    ])
      expect(output).toContain(value);
    for (const secret of [
      "test-key",
      diagnosis.root_cause_internal,
      diagnosis.fix_internal,
      diagnosis.checked_internal,
    ])
      expect(output).not.toContain(secret);
    expect(fake.requests).toHaveLength(1);
    const request = fake.requests[0].body;
    expect(request).toMatchObject({
      stream: true,
      max_completion_tokens: 16000,
      prompt_cache_key: `problem:${id}`,
    });
    expect(JSON.stringify(request.messages)).toContain(
      readFileSync(`docs/examples/cf-${id}-${slug}/student.cpp`, "utf8").split("\n")[0],
    );
  },
);
