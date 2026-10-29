import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runSmoke } from "@/scripts/smoke-meta";
import { chatCompletion, createFakeFetch, noNetworkFetch } from "../llm/fake-fetch";

beforeEach(() => vi.stubGlobal("fetch", noNetworkFetch));
afterEach(() => vi.unstubAllGlobals());

describe("runSmoke", () => {
  it.each([undefined, ""])(
    "returns 2 with setup guidance when MODEL_API_KEY is %s",
    async (apiKey) => {
      const print = vi.fn<(line: string) => void>();
      const fetch = vi.fn(noNetworkFetch);
      expect(await runSmoke({ MODEL_API_KEY: apiKey }, { fetch, print })).toBe(2);
      expect(print).toHaveBeenCalledWith(
        expect.stringMatching(/MODEL_API_KEY is not set.*\.env\.local/),
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("returns 0 and prints model, latency and cached usage without the key", async () => {
    const fake = createFakeFetch([
      {
        status: 200,
        json: chatCompletion(JSON.stringify({ ok: true, model_says: "ready" })),
      },
    ]);
    const print = vi.fn<(line: string) => void>();
    const env = {
      MODEL_API_KEY: "test-key",
      MODEL_API_BASE_URL: "https://meta.test/v1",
      MODEL_NORMALIZE: "muse-spark-1.3",
    };
    expect(await runSmoke(env, { fetch: fake.fetch, print })).toBe(0);
    expect(fake.requests).toHaveLength(1);
    const output = print.mock.calls.map(([line]) => line).join("\n");
    expect(output).toContain("muse-spark-1.3");
    expect(output).toContain("latency");
    expect(output).toContain("cached_tokens");
    expect(output).not.toContain(env.MODEL_API_KEY);
  });

  it("returns 1 and prints HTTP 401 without the key", async () => {
    const fake = createFakeFetch([{ status: 401, json: { error: { message: "Unauthorized" } } }]);
    const print = vi.fn<(line: string) => void>();
    expect(await runSmoke({ MODEL_API_KEY: "test-key" }, { fetch: fake.fetch, print })).toBe(1);
    expect(fake.requests).toHaveLength(1);
    const output = print.mock.calls.map(([line]) => line).join("\n");
    expect(output).toContain("401");
    expect(output).not.toContain("test-key");
  });
});
