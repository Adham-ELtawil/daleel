import { z } from "zod";

export function createRateLimiter({
  minIntervalMs = 2000,
  now = () => Date.now(),
  sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
}: { minIntervalMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> } = {}) {
  let queue = Promise.resolve();
  let lastStart: number | null = null;
  return {
    wait() {
      const turn = queue.then(async () => {
        if (lastStart !== null) {
          let delay: number;
          while ((delay = lastStart + minIntervalMs - now()) > 0) await sleep(delay);
        }
        lastStart = now();
      });
      queue = turn.catch(() => {}); // A failed sleep must not strand later FIFO callers.
      return turn;
    },
  };
}

// Shared across every client in this process, rather than per request/client.
const defaultLimiter = createRateLimiter();
type Cache = Map<string, { value: unknown; expiresAt: number }>;
// TODO: Persist the global API caches as a DB/file blob per docs/03-ARCHITECTURE.md §8.
const defaultCache: Cache = new Map();

const problemSchema = z.object({
  contestId: z.number().int().optional(),
  index: z.string(),
  name: z.string(),
  type: z.enum(["PROGRAMMING", "QUESTION"]),
  points: z.number().optional(),
  rating: z.number().int().optional(),
  tags: z.array(z.string()),
});
const problemsetSchema = z.object({
  problems: z.array(problemSchema),
  problemStatistics: z.array(
    z.object({
      contestId: z.number().int().optional(),
      index: z.string(),
      solvedCount: z.number().int().nonnegative(),
    }),
  ),
});
const contestsSchema = z.array(
  z.object({
    id: z.number().int(),
    name: z.string(),
    type: z.enum(["CF", "ICPC", "IOI"]),
    phase: z.string(),
    frozen: z.boolean(),
    durationSeconds: z.number().int().nonnegative(),
    startTimeSeconds: z.number().int().optional(),
    relativeTimeSeconds: z.number().int().optional(),
  }),
);
const submissionsSchema = z.array(
  z.object({
    id: z.number().int(),
    creationTimeSeconds: z.number().int(),
    problem: problemSchema,
    verdict: z.string().optional(),
  }),
);
const envelopeSchema = z.object({
  status: z.string(),
  comment: z.string().optional(),
  result: z.unknown().optional(),
});

export class CfApiError extends Error {
  constructor(public readonly comment: string) {
    super(comment);
    this.name = "CfApiError";
  }
}

export function createCfApi(deps: {
  fetch?: typeof fetch;
  baseUrl?: string;
  userAgent: string;
  limiter?: ReturnType<typeof createRateLimiter>;
  now?: () => number;
  cache?: Cache;
}) {
  const baseUrl = z
    .url()
    .parse(deps.baseUrl ?? process.env.CF_API_BASE_URL ?? "https://codeforces.com/api")
    .replace(/\/+$/, "");
  const fetch = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? (() => Date.now());
  const limiter = deps.limiter ?? defaultLimiter;
  const cache = deps.cache ?? defaultCache;

  async function request<T>(
    method: string,
    schema: z.ZodType<T>,
    ttlMs = 0,
    params: Record<string, string> = {},
  ): Promise<T> {
    const url = new URL(`${baseUrl}/${method}`);
    url.search = new URLSearchParams(params).toString();
    const key = url.href;
    const cached = ttlMs ? cache.get(key) : undefined;
    if (cached && now() < cached.expiresAt) return schema.parse(cached.value);
    if (cached) cache.delete(key);

    await limiter.wait();
    const response = await fetch(url.href, {
      headers: { "User-Agent": deps.userAgent },
      signal: AbortSignal.timeout(8000),
    });
    const body = envelopeSchema.parse(await response.json());
    if (body.status !== "OK") throw new CfApiError(body.comment ?? "Codeforces API failed");
    if (!response.ok) throw new CfApiError(`Codeforces API HTTP ${response.status}`);
    const value = schema.parse(body.result);
    if (ttlMs) cache.set(key, { value, expiresAt: now() + ttlMs });
    return value;
  }

  return {
    problemsetProblems: () => request("problemset.problems", problemsetSchema, 24 * 60 * 60 * 1000),
    contestList: () => request("contest.list", contestsSchema, 10 * 60 * 1000),
    userStatus: (handle: string, count: number) =>
      request("user.status", submissionsSchema, 0, { handle, count: String(count) }),
  };
}

export function isContestRunning(
  contestId: number,
  contests: z.infer<typeof contestsSchema>,
): boolean {
  // PRD US-9 blocks BEFORE/CODING only; system testing happens after coding closes.
  // Resolve/diagnose routes map this to 423 contest_running (architecture §4) in later PRs.
  return contests.some(
    (contest) =>
      contest.id === contestId && (contest.phase === "BEFORE" || contest.phase === "CODING"),
  );
}

export function ratingAndTags(
  problems: z.infer<typeof problemSchema>[],
  contestId: number,
  index: string,
): { rating: number | null; tags: string[] } {
  const problem = problems.find(
    (problem) => problem.contestId === contestId && problem.index === index,
  );
  return { rating: problem?.rating ?? null, tags: problem?.tags ?? [] };
}
