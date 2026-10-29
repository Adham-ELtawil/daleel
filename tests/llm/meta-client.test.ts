import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  BudgetReached,
  createMetaClient,
  jsonSchemaFor,
  MetaApiError,
  OutputTruncated,
  SchemaError,
  type ChatMessage,
  type LlmCallRecord,
  type LlmStepConfig,
  type MetaClientDeps,
} from "@/src/llm/meta-client";
import { costUsd } from "@/src/llm/pricing";
import { chatCompletion, createFakeFetch, noNetworkFetch, type FakeResponse } from "./fake-fetch";

const baseURL = "https://meta.test/v1";
const answerSchema = z.object({ answer: z.string(), score: z.number() });
const answer = { answer: "checked", score: 0.8 };
const cfg: LlmStepConfig = {
  step: "diagnose",
  model: "muse-spark-1.3",
  reasoningEffort: "high",
  maxCompletionTokens: 128,
  stream: false,
  schemaName: "Answer",
  schema: jsonSchemaFor(answerSchema),
};
const messages: ChatMessage[] = [
  { role: "developer", content: "Return a structured assessment." },
  { role: "user", content: "<problem>Count elements.</problem>" },
  { role: "user", content: "<student_code>int count = 0;</student_code>" },
];
const opts = {
  attemptId: "attempt-1",
  userId: "trainee-42",
  cacheKey: "attempt-cache",
  zod: answerSchema,
};
const ok = (content = JSON.stringify(answer), cached = true): FakeResponse => ({
  status: 200,
  json: chatCompletion(content, cached),
});
const apiError = (status: number, message = "Service unavailable"): FakeResponse => ({
  status,
  json: { error: { message, type: "api_error", code: "test_error" } },
});

function setup(responses: FakeResponse[], overrides: Partial<MetaClientDeps> = {}) {
  const fake = createFakeFetch(responses);
  const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
  const logCall = vi.fn<(rec: LlmCallRecord) => Promise<void>>().mockResolvedValue(undefined);
  let time = 1000;
  const client = createMetaClient({
    apiKey: "test-key",
    baseURL,
    fetch: fake.fetch,
    sleep,
    random: () => 0,
    now: () => (time += 10),
    promptCacheRetention: "24h",
    dailyBudgetUsd: 10,
    getSpentTodayUsd: vi.fn<MetaClientDeps["getSpentTodayUsd"]>().mockResolvedValue(0),
    logCall,
    ...overrides,
  });
  return { client, fake, sleep, logCall };
}

beforeEach(() => vi.stubGlobal("fetch", noNetworkFetch));
afterEach(() => vi.unstubAllGlobals());

describe("jsonSchemaFor", () => {
  it("uses zod's JSON schema without the $schema key", () => {
    const expected = Object.fromEntries(
      Object.entries(z.toJSONSchema(answerSchema)).filter(([key]) => key !== "$schema"),
    );
    expect(jsonSchemaFor(answerSchema)).toEqual(expected);
    expect(jsonSchemaFor(answerSchema)).not.toHaveProperty("$schema");
  });
});

describe("createMetaClient().callStructured", () => {
  it("returns validated JSON and sends the required Meta parameters", async () => {
    const { client, fake } = setup([ok()]);
    const originalMessages = structuredClone(messages);
    expect(await client.callStructured(cfg, messages, opts)).toEqual(answer);
    expect(fake.requests).toHaveLength(1);
    const [request] = fake.requests;
    expect(request.url).toBe(`${baseURL}/chat/completions`);
    expect(request.method).toBe("POST");
    expect(request.headers.get("authorization")).toBe("Bearer test-key");
    expect(request.body).toMatchObject({
      model: cfg.model,
      messages: originalMessages,
      reasoning_effort: cfg.reasoningEffort,
      max_completion_tokens: cfg.maxCompletionTokens,
      response_format: {
        type: "json_schema",
        json_schema: { name: cfg.schemaName, schema: cfg.schema, strict: true },
      },
      prompt_cache_key: opts.cacheKey,
      prompt_cache_retention: "24h",
      safety_identifier: createHash("sha256").update(opts.userId).digest("hex").slice(0, 64),
    });
    for (const key of [
      "temperature",
      "top_p",
      "stop",
      "n",
      "logit_bias",
      "logprobs",
      "frequency_penalty",
      "presence_penalty",
    ]) {
      expect(request.body).not.toHaveProperty(key);
    }
  });

  it("honors Retry-After on a 429 before retrying", async () => {
    const { client, fake, sleep } = setup([
      { ...apiError(429), headers: { "retry-after": "2" } },
      ok(),
    ]);
    expect(await client.callStructured(cfg, messages, opts)).toEqual(answer);
    expect(fake.requests).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep.mock.calls[0][0]).toBeGreaterThanOrEqual(2000);
  });

  it("retries 503 three times with deterministic exponential backoff", async () => {
    const { client, fake, sleep } = setup([apiError(503), apiError(503), apiError(503), ok()]);
    expect(await client.callStructured(cfg, messages, opts)).toEqual(answer);
    expect(fake.requests).toHaveLength(4);
    expect(sleep.mock.calls).toEqual([[500], [1000], [2000]]);
  });

  it("stops retrying 500 after four total requests", async () => {
    const { client, fake } = setup(Array.from({ length: 4 }, () => apiError(500)));
    const result = client.callStructured(cfg, messages, opts);
    await expect(result).rejects.toBeInstanceOf(MetaApiError);
    await expect(result).rejects.toMatchObject({ status: 500 });
    expect(fake.requests).toHaveLength(4);
  });

  it("logs a 400 error and rejects without retrying", async () => {
    const message = "Unsupported request parameter";
    const { client, fake, sleep, logCall } = setup([apiError(400, message)]);
    const result = client.callStructured(cfg, messages, opts);
    await expect(result).rejects.toBeInstanceOf(MetaApiError);
    await expect(result).rejects.toMatchObject({ status: 400 });
    expect(fake.requests).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(logCall).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        httpStatus: 400,
        error: expect.stringContaining(message),
      }),
    );
  });

  it("retries invalid JSON with a final developer repair instruction", async () => {
    const { client, fake } = setup([ok("not json"), ok()]);
    expect(await client.callStructured(cfg, messages, opts)).toEqual(answer);
    expect(fake.requests).toHaveLength(2);
    const retryMessages = z
      .array(z.object({ role: z.string(), content: z.string() }))
      .parse(fake.requests[1].body.messages);
    const repair = retryMessages.at(-1);
    expect(repair?.role).toBe("developer");
    expect(repair?.content).toMatch(/^Your previous output did not match the schema/);
    expect(repair?.content).toMatch(/Return only valid JSON\.$/);
  });

  it("rejects SchemaError after two schema mismatches", async () => {
    const { client, fake } = setup([ok('{"answer":123}'), ok('{"score":"wrong"}')]);
    await expect(client.callStructured(cfg, messages, opts)).rejects.toBeInstanceOf(SchemaError);
    expect(fake.requests).toHaveLength(2);
  });

  it("rejects at the daily budget before making a request", async () => {
    const { client, fake } = setup([], { getSpentTodayUsd: vi.fn().mockResolvedValue(10) });
    await expect(client.callStructured(cfg, messages, opts)).rejects.toBeInstanceOf(BudgetReached);
    expect(fake.requests).toHaveLength(0);
  });

  it("logs successful usage, price, latency and a SHA-256 request hash once", async () => {
    const { client, logCall } = setup([ok()]);
    await client.callStructured(cfg, messages, opts);
    expect(logCall).toHaveBeenCalledTimes(1);
    const [record] = logCall.mock.calls[0];
    expect(record).toMatchObject({
      step: cfg.step,
      attemptId: opts.attemptId,
      model: cfg.model,
      status: "ok",
      httpStatus: 200,
      inputTokens: 100,
      outputTokens: 50,
      cachedTokens: 40,
      costUsd: costUsd(cfg.model, { promptTokens: 100, completionTokens: 50, cachedTokens: 40 }),
      requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      error: null,
    });
    expect(record.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("gives identical requests the same request hash", async () => {
    const { client, logCall } = setup([ok(), ok()]);
    await client.callStructured(cfg, messages, opts);
    await client.callStructured(cfg, messages, opts);
    expect(logCall).toHaveBeenCalledTimes(2);
    expect(logCall.mock.calls[0][0].requestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(logCall.mock.calls[1][0].requestHash).toBe(logCall.mock.calls[0][0].requestHash);
  });

  it("logs zero cached tokens when prompt_tokens_details is missing", async () => {
    const { client, logCall } = setup([ok(JSON.stringify(answer), false)]);
    await client.callStructured(cfg, messages, opts);
    expect(logCall).toHaveBeenCalledWith(expect.objectContaining({ cachedTokens: 0 }));
  });

  it("assembles streamed JSON and logs the final usage chunk", async () => {
    const content = JSON.stringify(answer);
    const chunk = { id: "x", object: "chat.completion.chunk", created: 1, model: cfg.model };
    const chunks = [
      ...[content.slice(0, 12), content.slice(12)].map((piece) => ({
        ...chunk,
        choices: [{ index: 0, delta: { content: piece }, finish_reason: null }],
      })),
      { ...chunk, choices: [], usage: chatCompletion(content).usage },
    ];
    const sse =
      chunks.map((item) => `data: ${JSON.stringify(item)}\n\n`).join("") + "data: [DONE]\n\n";
    const { client, fake, logCall } = setup([{ status: 200, sse }]);
    expect(await client.callStructured({ ...cfg, stream: true }, messages, opts)).toEqual(answer);
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0].body).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    });
    expect(logCall).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 100,
        outputTokens: 50,
        cachedTokens: 40,
      }),
    );
  });

  it("rejects an empty API key with MODEL_API_KEY guidance before any request", async () => {
    const fake = createFakeFetch([]);
    const result = (async () => {
      const { client } = setup([], { apiKey: "", fetch: fake.fetch });
      return client.callStructured(cfg, messages, opts);
    })();
    await expect(result).rejects.toThrow(/MODEL_API_KEY/);
    expect(fake.requests).toHaveLength(0);
  });
  it("retries once with double max_completion_tokens when output is cut by finish_reason length", async () => {
    const truncated = chatCompletion("");
    truncated.choices[0] = { ...truncated.choices[0], finish_reason: "length" };
    const body = {
      ...truncated,
      choices: [{ ...truncated.choices[0], message: { role: "assistant", content: null } }],
    };
    const { client, fake, logCall } = setup([{ status: 200, json: body }, ok()]);
    expect(await client.callStructured(cfg, messages, opts)).toEqual(answer);
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[1].body.max_completion_tokens).toBe(cfg.maxCompletionTokens * 2);
    expect(logCall.mock.calls[0][0]).toMatchObject({
      status: "error",
      error: expect.stringContaining("length"),
    });
  });

  it("rejects OutputTruncated when the larger budget is also cut off", async () => {
    const truncated = chatCompletion('{"answer":');
    truncated.choices[0] = { ...truncated.choices[0], finish_reason: "length" };
    const { client, fake } = setup([
      { status: 200, json: truncated },
      { status: 200, json: truncated },
    ]);
    await expect(client.callStructured(cfg, messages, opts)).rejects.toBeInstanceOf(
      OutputTruncated,
    );
    expect(fake.requests).toHaveLength(2);
  });

  it("logs reasoning tokens from completion_tokens_details (0 when missing)", async () => {
    const withReasoning = chatCompletion(JSON.stringify(answer));
    const body = {
      ...withReasoning,
      usage: { ...withReasoning.usage, completion_tokens_details: { reasoning_tokens: 30 } },
    };
    const { client, logCall } = setup([{ status: 200, json: body }, ok()]);
    await client.callStructured(cfg, messages, opts);
    await client.callStructured(cfg, messages, opts);
    expect(logCall.mock.calls[0][0].reasoningTokens).toBe(30);
    expect(logCall.mock.calls[1][0].reasoningTokens).toBe(0);
  });
});
