import { z } from "zod";

export type FakeResponse = { status: number; headers?: HeadersInit } & (
  { json: unknown } | { sse: string }
);

export const noNetworkFetch: typeof fetch = async () => {
  throw new Error("Unexpected real network request");
};

export function createFakeFetch(queue: FakeResponse[]) {
  const pending = [...queue];
  const requests: {
    url: string;
    method: string;
    headers: Headers;
    body: Record<string, unknown>;
  }[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const rawBody = await request.text();
    requests.push({
      url: request.url,
      method: request.method,
      headers: new Headers(request.headers),
      body: rawBody ? z.record(z.string(), z.unknown()).parse(JSON.parse(rawBody)) : {},
    });
    const next = pending.shift();
    if (!next) throw new Error("Fake fetch response queue exhausted");
    const headers = new Headers(next.headers);
    headers.set("content-type", "json" in next ? "application/json" : "text/event-stream");
    return new Response("json" in next ? JSON.stringify(next.json) : next.sse, {
      status: next.status,
      headers,
    });
  };
  return { fetch: fakeFetch, requests };
}

export function chatCompletion(content: string, includeCachedTokens = true) {
  return {
    id: "x",
    object: "chat.completion",
    created: 1,
    model: "muse-spark-1.3",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      ...(includeCachedTokens ? { prompt_tokens_details: { cached_tokens: 40 } } : {}),
    },
  };
}
