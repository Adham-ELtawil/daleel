import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  CfApiError,
  createCfApi,
  createRateLimiter,
  isContestRunning,
  ratingAndTags,
} from "@/src/judges/cf-api";
import problemsFixture from "@/tests/fixtures/cf-api/problemset.problems.json";
import contestsFixture from "@/tests/fixtures/cf-api/contest.list.json";

const userAgent = "Mozilla/5.0 Chrome/130.0 Safari/537.36";

function fakeClock() {
  let time = 10_000;
  const advance = (ms: number) => {
    time += ms;
  };
  return { now: () => time, advance, sleep: vi.fn(async (ms: number) => advance(ms)) };
}

function setup(body: unknown = problemsFixture) {
  const clock = fakeClock();
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => Response.json(body));
  const cache = new Map<string, { value: unknown; expiresAt: number }>();
  const deps = { fetch, userAgent, limiter: createRateLimiter(clock), now: clock.now, cache };
  return { ...clock, fetch, deps, api: createCfApi(deps) };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("createRateLimiter", () => {
  it("starts three back-to-back calls at t, t+2000, t+4000", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter(clock);
    const starts: number[] = [];
    for (let i = 0; i < 3; i++) {
      await limiter.wait();
      starts.push(clock.now());
    }
    expect(starts).toEqual([10_000, 12_000, 14_000]);
    expect(clock.sleep.mock.calls).toEqual([[2000], [2000]]);
  });

  it("serialises concurrent callers in FIFO order", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter(clock);
    const starts: number[][] = [];
    await Promise.all(
      [0, 1, 2].map(async (id) => {
        await limiter.wait();
        starts.push([id, clock.now()]);
      }),
    );
    expect(starts).toEqual([
      [0, 10_000],
      [1, 12_000],
      [2, 14_000],
    ]);
    expect(clock.sleep.mock.calls).toEqual([[2000], [2000]]);
  });

  it("honours a custom interval and does not sleep after an idle interval", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ ...clock, minIntervalMs: 500 });
    await limiter.wait();
    await limiter.wait();
    clock.advance(1000);
    await limiter.wait();
    expect(clock.sleep.mock.calls).toEqual([[500]]);
  });
});

describe("createCfApi", () => {
  it.each([
    ["problemsetProblems", problemsFixture],
    ["contestList", contestsFixture],
  ] as const)("parses the saved %s response", async (method, fixture) => {
    const { api } = setup(fixture);
    expect(await api[method]()).toEqual(fixture.result);
  });

  it.each([
    ["problemsetProblems", problemsFixture, 24 * 60 * 60 * 1000],
    ["contestList", contestsFixture, 10 * 60 * 1000],
  ] as const)("caches %s until its TTL expires", async (method, fixture, ttl) => {
    const { api, fetch, advance } = setup(fixture);
    await api[method]();
    advance(ttl - 1);
    await api[method]();
    expect(fetch).toHaveBeenCalledOnce();
    advance(1);
    await api[method]();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shares an injected cache between clients, isolating endpoints and base URLs", async () => {
    const { api, deps, fetch } = setup();
    await api.problemsetProblems();
    await createCfApi(deps).problemsetProblems();
    expect(fetch).toHaveBeenCalledOnce();
    await createCfApi({ ...deps, baseUrl: "https://cf.example/api/" }).problemsetProblems();
    fetch.mockResolvedValueOnce(Response.json(contestsFixture));
    await api.contestList();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("uses CF_API_BASE_URL, the browser UA and a timeout", async () => {
    vi.stubEnv("CF_API_BASE_URL", "https://cf.example/api/");
    const { api, fetch } = setup();
    await api.problemsetProblems();
    expect(String(fetch.mock.calls[0][0])).toBe("https://cf.example/api/problemset.problems");
    const options = fetch.mock.calls[0][1];
    expect(new Headers(options?.headers).get("User-Agent")).toBe(userAgent);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("throws CfApiError with the FAILED comment, including on HTTP 400, without caching it", async () => {
    const comment = "Call limit exceeded";
    const { api, fetch } = setup({ status: "FAILED", comment });
    fetch.mockResolvedValueOnce(Response.json({ status: "FAILED", comment }, { status: 400 }));
    await expect(api.problemsetProblems()).rejects.toBeInstanceOf(CfApiError);
    await expect(api.problemsetProblems()).rejects.toMatchObject({
      name: "CfApiError",
      message: comment,
    });
    fetch.mockResolvedValueOnce(Response.json(problemsFixture));
    expect(await api.problemsetProblems()).toEqual(problemsFixture.result);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each([
    [
      "problemsetProblems",
      { status: "OK", result: { problems: [{ index: "A" }], problemStatistics: [] } },
    ],
    ["contestList", { status: "OK", result: [{ ...contestsFixture.result[0], phase: "UNKNOWN" }] }],
  ] as const)("rejects malformed %s results with zod", async (method, body) => {
    const { api } = setup(body);
    await expect(api[method]()).rejects.toBeInstanceOf(z.ZodError);
  });

  it("validates uncached user.status submissions and encodes handle/count", async () => {
    const submissions = [
      {
        id: 123,
        creationTimeSeconds: 1793318400,
        problem: problemsFixture.result.problems[0],
        verdict: "WRONG_ANSWER",
      },
    ];
    const { api, fetch } = setup({ status: "OK", result: submissions });
    expect(await api.userStatus("trainee_1+practice", 5)).toEqual(submissions);
    await api.userStatus("trainee_1+practice", 5);
    expect(fetch).toHaveBeenCalledTimes(2);
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.pathname).toBe("/api/user.status");
    expect(url.searchParams.get("handle")).toBe("trainee_1+practice");
    expect(url.searchParams.get("count")).toBe("5");
    fetch.mockResolvedValueOnce(Response.json({ status: "OK", result: [{ id: "bad" }] }));
    await expect(api.userStatus("trainee_1", 5)).rejects.toBeInstanceOf(z.ZodError);
  });

  it("shares the default limiter across separate clients", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const starts: number[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => {
      starts.push(Date.now());
      return Response.json({ status: "OK", result: [] });
    });
    const pending = Promise.all([
      createCfApi({ fetch, userAgent }).userStatus("trainee_1", 1),
      createCfApi({ fetch, userAgent }).userStatus("trainee_2", 1),
      createCfApi({ fetch, userAgent }).userStatus("trainee_3", 1),
    ]);
    await vi.runAllTimersAsync();
    await pending;
    expect(starts).toEqual([0, 2000, 4000]);
  });
});

describe("CF metadata helpers", () => {
  it.each([
    ["BEFORE", true],
    ["CODING", true],
    ["PENDING_SYSTEM_TEST", false],
    ["SYSTEM_TEST", false],
    ["FINISHED", false],
  ] as const)("guards phase %s according to PRD US-9", async (phase, blocked) => {
    const fixture = structuredClone(contestsFixture);
    fixture.result[0].phase = phase;
    const contests = await setup(fixture).api.contestList();
    expect(isContestRunning(fixture.result[0].id, contests)).toBe(blocked);
    expect(isContestRunning(-1, contests)).toBe(false);
  });

  it("looks up 4A rating/tags and handles unrated or missing problems", async () => {
    const { problems } = await setup().api.problemsetProblems();
    expect(ratingAndTags(problems, 4, "A")).toEqual({ rating: 800, tags: ["brute force", "math"] });
    expect(ratingAndTags(problems, 2277, "F")).toEqual({
      rating: null,
      tags: ["data structures", "dfs and similar", "dsu", "trees"],
    });
    expect(ratingAndTags(problems, 4, "Z")).toEqual({ rating: null, tags: [] });
  });
});
