import { describe, expect, it, vi } from "vitest";
import { FetchFailed, fetchProblemHtml } from "@/src/judges/fetch-page";

const url = "https://codeforces.com/problemset/problem/4/A";
const userAgent = "Mozilla/5.0 Chrome/130.0 Safari/537.36";

describe("fetchProblemHtml", () => {
  it("sends the caller's browser User-Agent and returns HTML", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response("<html>problem</html>"));
    expect(await fetchProblemHtml(url, { fetch, userAgent })).toBe("<html>problem</html>");
    expect(fetch).toHaveBeenCalledOnce();
    const options = fetch.mock.calls[0][1];
    expect(new Headers(options?.headers).get("User-Agent")).toBe(userAgent);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("wraps HTTP 403 in FetchFailed with its status", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response("Forbidden", { status: 403 }));
    await expect(fetchProblemHtml(url, { fetch, userAgent })).rejects.toBeInstanceOf(FetchFailed);
    await expect(fetchProblemHtml(url, { fetch, userAgent })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("wraps an actual AbortSignal timeout", async () => {
    const fetch: typeof globalThis.fetch = async (_url, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), {
          once: true,
        });
      });
    await expect(fetchProblemHtml(url, { fetch, userAgent, timeoutMs: 10 })).rejects.toMatchObject({
      name: "FetchFailed",
      status: null,
    });
  });

  it("wraps network and body-read errors without exposing upstream details", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new TypeError("private upstream details"));
    await expect(fetchProblemHtml(url, { fetch, userAgent })).rejects.toMatchObject({
      name: "FetchFailed",
      status: null,
    });
    fetch.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("private upstream details"));
          },
        }),
      ),
    );
    await expect(fetchProblemHtml(url, { fetch, userAgent })).rejects.toMatchObject({
      message: "Problem page fetch failed",
      status: null,
    });
  });
});
