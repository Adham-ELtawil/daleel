import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createCfApi, createRateLimiter } from "@/src/judges/cf-api";
import { getProblemByExternalId, type Problem } from "@/src/db/repo/problems";
import { attempts, problems, users } from "@/src/db/schema";
import { seed } from "@/src/db/seed";
import { createHandlers } from "@/src/services/handlers";
import { resolveProblem } from "@/src/services/problem-service";
import { tempDb } from "@/tests/db/helpers";
import contests from "@/tests/fixtures/cf-api/contest.list.json";
import problemset from "@/tests/fixtures/cf-api/problemset.problems.json";

const url = "https://codeforces.com/problemset/problem/4/A";
const request = (body: unknown) =>
  new Request("http://localhost/api", {
    method: "POST",
    headers: { "x-request-id": "pr08-test" },
    body: JSON.stringify(body),
  });
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
let store: Awaited<ReturnType<typeof tempDb>>;
let problemId: string;
function setup() {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(
      async () => new Response(readFileSync("tests/fixtures/judges/cf-4A.html", "utf8")),
    );
  const api = createCfApi({
    userAgent: "Mozilla/5.0",
    cache: new Map(),
    limiter: createRateLimiter({ minIntervalMs: 0 }),
    fetch: async (url) =>
      Response.json(String(url).includes("contest.list") ? contests : problemset),
  });
  const cfApi = {
    contestList: vi.fn(api.contestList),
    problemsetProblems: vi.fn(api.problemsetProblems),
  };
  const deps = { db: async () => store.db, fetch, cfApi, now: () => 1000, log: vi.fn() };
  return { deps, handlers: createHandlers(deps) };
}
beforeEach(async () => {
  store = await tempDb();
  await seed(store.db, 1000);
  problemId = (await getProblemByExternalId(store.db, "codeforces", "4A"))!.id;
});
afterEach(() => store.cleanup());

it("returns the cached problem with zero page fetches or CF API calls, also on a second resolve", async () => {
  const { handlers, deps } = setup();
  for (let n = 0; n < 2; n++) {
    const response = await handlers.resolve(request({ url }));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("pr08-test");
    expect(await response.json()).toMatchObject({
      problem: { id: problemId, title: "Watermelon" },
    });
  }
  for (const call of [deps.fetch, deps.cfApi.contestList, deps.cfApi.problemsetProblems])
    expect(call).not.toHaveBeenCalled();
});
it.each([403, 200])(
  "maps a failed fetch or invalid page (%i) to the safe 502 error shape",
  async (status) => {
    await store.db.delete(problems);
    const { handlers, deps } = setup();
    deps.fetch.mockResolvedValueOnce(new Response("<html/>", { status }));
    const response = await handlers.resolve(request({ url }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: { code: "fetch_failed", message: expect.any(String) },
    });
  },
);
it.each([
  ["https://unsupported.example/task", 422, "unsupported_url"],
  ["https://codeforces.com/gym/4/problem/A", 502, "fetch_failed"],
])("rejects %s without fetching", async (url, status, code) => {
  const { handlers, deps } = setup();
  const response = await handlers.resolve(request({ url }));
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ error: { code, message: expect.any(String) } });
  expect(deps.fetch).not.toHaveBeenCalled();
});
it("blocks a running contest before fetching its page", async () => {
  const { handlers, deps } = setup();
  deps.cfApi.contestList.mockResolvedValueOnce([
    { ...contests.result[0], id: 999, type: "CF", phase: "CODING" },
  ]);
  const response = await handlers.resolve(
    request({ url: "https://codeforces.com/contest/999/problem/A" }),
  );
  expect(response.status).toBe(423);
  expect(await response.json()).toMatchObject({ error: { code: "contest_running" } });
  expect(deps.fetch).not.toHaveBeenCalled();
});
it.each([false, true])(
  "fetches and caches CF metadata, tolerating metadata failure=%s",
  async (failed) => {
    await store.db.delete(problems);
    const { deps } = setup();
    if (failed) deps.cfApi.problemsetProblems.mockRejectedValueOnce(new Error("API unavailable"));
    const problem = await resolveProblem({ url }, { ...deps, db: store.db });
    expect(problem).toMatchObject({
      title: "Watermelon",
      rating: failed ? null : 800,
      tags: failed ? [] : ["brute force", "math"],
      fetchedAt: 1000,
    });
    expect(await resolveProblem({ url }, { ...deps, db: store.db })).toEqual(problem);
    expect(deps.fetch).toHaveBeenCalledOnce();
    expect(deps.cfApi.contestList).toHaveBeenCalledOnce();
    expect(deps.cfApi.problemsetProblems).toHaveBeenCalledOnce();
  },
);
it("stores the exact pasted text as a custom problem and reuses its hash without network", async () => {
  const { deps, handlers } = setup();
  const statement = "\nTiny task\nFind a number.";
  const response = await handlers.resolve(request({ statement }));
  expect(response.status).toBe(200);
  const { problem }: { problem: Problem } = await response.json();
  expect(problem).toMatchObject({
    judge: "custom",
    externalId: hash(statement).slice(0, 16),
    title: "Tiny task",
    statementMd: statement,
    inputSpecMd: "",
    outputSpecMd: "",
    samples: [],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
  });
  expect(await resolveProblem({ statement }, { ...deps, db: store.db })).toEqual(problem);
  for (const call of [deps.fetch, deps.cfApi.contestList, deps.cfApi.problemsetProblems])
    expect(call).not.toHaveBeenCalled();
});
it.each([{}, { url, statement: "task" }, { statement: " " }, { statement: "x".repeat(20001) }])(
  "rejects invalid resolve body %#",
  async (body) => {
    const response = await setup().handlers.resolve(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid" } });
  },
);
it("gets a problem by id and returns 404 for an unknown id", async () => {
  const { handlers } = setup();
  const response = await handlers.problem(request({}), problemId);
  expect(await response.json()).toMatchObject({
    problem: { title: "Watermelon", samples: [{ input: "8\n", output: "YES\n" }] },
  });
  expect((await handlers.problem(request({}), "missing")).status).toBe(404);
});
it.each(["x".repeat(65537), "é".repeat(32769)])(
  "rejects code over 64 KB in UTF-8",
  async (code) => {
    const response = await setup().handlers.attempt(
      request({ problemId, language: "cpp17", code }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "code_too_large" } });
  },
);
it.each([
  { language: "rust" },
  { verdictReported: "AC" },
  { verdictTestNo: 1.5 },
  { studentNote: "x".repeat(1001) },
])("validates attempt fields %#", async (fields) => {
  expect(
    (
      await setup().handlers.attempt(
        request({ problemId, language: "cpp17", code: "code", ...fields }),
      )
    ).status,
  ).toBe(400);
});
it("stores a valid attempt and a child, with code hashes and one shared local guest", async () => {
  const { handlers } = setup();
  const code = "é".repeat(32768); // Exactly 65536 UTF-8 bytes.
  const fields = {
    problemId,
    language: "python3",
    code,
    verdictReported: "WA",
    verdictTestNo: 2,
    studentNote: "My idea",
  };
  const response = await handlers.attempt(request(fields));
  expect(response.status).toBe(200);
  const { attemptId }: { attemptId: string } = await response.json();
  expect(attemptId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  expect(await store.db.select().from(attempts)).toMatchObject([
    {
      ...fields,
      id: attemptId,
      codeHash: hash(code),
      status: "new",
      locale: "en",
      parentAttemptId: null,
    },
  ]);
  expect((await handlers.attempt(request({ ...fields, parentAttemptId: attemptId }))).status).toBe(
    200,
  );
  expect(
    (await store.db.select().from(users)).filter((user) => user.handle === "guest_local"),
  ).toMatchObject([{ role: "student", locale: "en", isGuest: 1 }]);
  const rows = await store.db.select().from(attempts);
  expect(rows[1].parentAttemptId).toBe(attemptId);
  expect(rows[1].userId).toBe(rows[0].userId);
});
it("returns 404 for an unknown problem without storing an attempt", async () => {
  const response = await setup().handlers.attempt(
    request({ problemId: "missing", language: "cpp17", code: "code" }),
  );
  expect(response.status).toBe(404);
  expect(await store.db.select().from(attempts)).toHaveLength(0);
});
it("returns safe JSON for malformed JSON and DB failures, logging the request id", async () => {
  const { deps, handlers } = setup();
  expect(
    (await handlers.resolve(new Request("http://localhost", { method: "POST", body: "{" }))).status,
  ).toBe(400);
  const failed = createHandlers({
    ...deps,
    db: async () => {
      throw new Error("private database detail");
    },
  });
  const response = await failed.problem(request({}), problemId);
  expect(response.status).toBe(500);
  expect(response.headers.get("x-request-id")).toBe("pr08-test");
  expect(await response.json()).toEqual({
    error: { code: "internal_error", message: expect.any(String) },
  });
  expect(deps.log).toHaveBeenCalledWith({ requestId: "pr08-test", code: "internal_error" });
});
