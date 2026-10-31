import { describe, expect, it, vi } from "vitest";
import { type CurlRunner, FetchFailed, fetchProblemHtml } from "@/src/judges/fetch-page";

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
    const curl = vi.fn<CurlRunner>().mockRejectedValue(new Error("curl failed"));
    await expect(fetchProblemHtml(url, { fetch, userAgent, curl })).rejects.toBeInstanceOf(
      FetchFailed,
    );
    await expect(fetchProblemHtml(url, { fetch, userAgent, curl })).rejects.toMatchObject({
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

  describe("curl fallback when Cloudflare blocks fetch", () => {
    const blocked = (status: number, body = "Forbidden") =>
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(body, { status }));

    it.each([403, 503])("falls back to curl on HTTP %i and returns its body", async (status) => {
      const curl = vi
        .fn<CurlRunner>()
        .mockResolvedValue({ status: 200, body: "<html>real problem</html>" });
      expect(await fetchProblemHtml(url, { fetch: blocked(status), userAgent, curl })).toBe(
        "<html>real problem</html>",
      );
      expect(curl).toHaveBeenCalledWith(url, userAgent);
    });

    it("falls back to curl when fetch gets a 200 Cloudflare challenge page", async () => {
      const challenge = "<html><head><title>Just a moment...</title></head></html>";
      const curl = vi.fn<CurlRunner>().mockResolvedValue({ status: 200, body: "<html>ok</html>" });
      expect(await fetchProblemHtml(url, { fetch: blocked(200, challenge), userAgent, curl })).toBe(
        "<html>ok</html>",
      );
    });

    it("throws the original FetchFailed when curl is missing (ENOENT)", async () => {
      const curl = vi
        .fn<CurlRunner>()
        .mockRejectedValue(Object.assign(new Error("spawn curl ENOENT"), { code: "ENOENT" }));
      await expect(
        fetchProblemHtml(url, { fetch: blocked(403), userAgent, curl }),
      ).rejects.toMatchObject({
        name: "FetchFailed",
        status: 403,
        message: "Problem page fetch failed",
      });
      expect(curl).toHaveBeenCalledOnce();
    });

    it("throws the original FetchFailed when curl also gets a non-200 status", async () => {
      const curl = vi.fn<CurlRunner>().mockResolvedValue({ status: 403, body: "Forbidden" });
      await expect(
        fetchProblemHtml(url, { fetch: blocked(403), userAgent, curl }),
      ).rejects.toMatchObject({ name: "FetchFailed", status: 403 });
    });

    it("never calls curl when fetch succeeds", async () => {
      const curl = vi.fn<CurlRunner>();
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(new Response("<html>problem</html>"));
      expect(await fetchProblemHtml(url, { fetch, userAgent, curl })).toBe("<html>problem</html>");
      expect(curl).not.toHaveBeenCalled();
    });

    it("does not treat a real page's Cloudflare beacon script as a challenge", async () => {
      const curl = vi.fn<CurlRunner>();
      const html =
        '<title>4A</title><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js">';
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(html));
      expect(await fetchProblemHtml(url, { fetch, userAgent, curl })).toBe(html);
      expect(curl).not.toHaveBeenCalled();
    });

    it.each([
      "https://evil.example/problem",
      "http://codeforces.com/problemset/problem/4/A",
      "https://codeforces.com.evil.example/x",
      "file:///etc/passwd",
    ])("never calls curl for non-allowed URL %s", async (target) => {
      const curl = vi.fn<CurlRunner>().mockResolvedValue({ status: 200, body: "x" });
      await expect(
        fetchProblemHtml(target, { fetch: blocked(403), userAgent, curl }),
      ).rejects.toMatchObject({ name: "FetchFailed", status: 403 });
      expect(curl).not.toHaveBeenCalled();
    });

    it("allows atcoder.jp and www.codeforces.com", async () => {
      for (const target of [
        "https://atcoder.jp/contests/abc300/tasks/abc300_a",
        "https://www.codeforces.com/contest/2278/problem/A",
      ]) {
        const curl = vi.fn<CurlRunner>().mockResolvedValue({ status: 200, body: "ok" });
        expect(await fetchProblemHtml(target, { fetch: blocked(403), userAgent, curl })).toBe("ok");
      }
    });
  });
});
