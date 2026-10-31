import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getProblemByExternalId } from "@/src/db/repo/problems";
import { attempts, diagnoses, problems } from "@/src/db/schema";
import { seed } from "@/src/db/seed";
import { createCfApi, createRateLimiter } from "@/src/judges/cf-api";
import { diagnoseStepConfig } from "@/src/llm/prompts/diagnose";
import { ladderStepConfig } from "@/src/llm/prompts/ladder";
import { DiagnosisSchema } from "@/src/llm/schemas/diagnosis";
import { HintLadderSchema } from "@/src/llm/schemas/ladder";
import { createDiagnoseHandler } from "@/src/services/diagnose-handler";
import { createHandlers } from "@/src/services/handlers";
import { readSse, type DiagnoseEvent } from "@/src/services/sse";
import { tempDb } from "@/tests/db/helpers";
import contests from "@/tests/fixtures/cf-api/contest.list.json";
import problemset from "@/tests/fixtures/cf-api/problemset.problems.json";
import diagnosis from "@/tests/fixtures/llm/diagnosis-a.json";
import ladder from "@/tests/fixtures/llm/ladder-a.json";

const request = (body: unknown = {}) =>
  new Request("http://localhost/api", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "x-request-id": "pr21-test" },
  });
let store: Awaited<ReturnType<typeof tempDb>>;
let problemId: string;
beforeEach(async () => {
  store = await tempDb();
  await seed(store.db, 1000);
  problemId = (await getProblemByExternalId(store.db, "codeforces", "4A"))!.id;
});
afterEach(() => store.cleanup());

function setup(phase: string) {
  const fixture = structuredClone(contests);
  fixture.result[0] = { ...fixture.result[0], id: 4, phase };
  let time = 1000;
  const now = () => time;
  const apiFetch = vi.fn<typeof fetch>(async (url) =>
    Response.json(String(url).includes("contest.list") ? fixture : problemset),
  );
  const cfApi = createCfApi({
    userAgent: "Mozilla/5.0",
    fetch: apiFetch,
    cache: new Map(),
    now,
    limiter: createRateLimiter({ minIntervalMs: 0 }),
  });
  const pageFetch = vi.fn<typeof fetch>(
    async () => new Response(readFileSync("tests/fixtures/judges/cf-4A.html", "utf8")),
  );
  const llm = vi.fn(async () => DiagnosisSchema.parse(diagnosis));
  const ladderLlm = vi.fn(async () => HintLadderSchema.parse(ladder));
  const log = vi.fn();
  const deps = { db: async () => store.db, cfApi, now, log };
  const handlers = createHandlers({ ...deps, fetch: pageFetch });
  const diagnose = createDiagnoseHandler({
    ...deps,
    llm,
    config: diagnoseStepConfig({}),
    ladder: { config: ladderStepConfig({}), llm: ladderLlm },
  });
  const attempt = () =>
    handlers.attempt(
      request({
        problemId,
        language: "cpp17",
        code: readFileSync("docs/examples/cf-4A-watermelon/student.cpp", "utf8"),
      }),
    );
  return {
    handlers,
    diagnose,
    attempt,
    llm,
    ladderLlm,
    log,
    apiFetch,
    pageFetch,
    advance: (phase: string) => {
      fixture.result[0].phase = phase;
      time += 600000;
    },
  };
}
const routes = ["resolve", "attempt", "diagnose"] as const;
type Route = (typeof routes)[number];
async function invoke(flow: ReturnType<typeof setup>, route: Route) {
  if (route === "resolve") {
    await store.db.delete(problems);
    return flow.handlers.resolve(request({ url: "https://codeforces.com/contest/4/problem/A" }));
  }
  if (route === "attempt") return flow.attempt();
  flow.advance("FINISHED");
  const { attemptId }: { attemptId: string } = await (await flow.attempt()).json();
  return { attemptId };
}
for (const route of routes) {
  it.each(["BEFORE", "CODING", "FINISHED", "UNKNOWN_PHASE"])(
    `${route} applies the current %s phase to a stored CF problem`,
    async (phase) => {
      const flow = setup(phase);
      const initial = await invoke(flow, route);
      flow.advance(phase);
      const response =
        initial instanceof Response ? initial : await flow.diagnose(request(), initial.attemptId);
      const blocked = phase === "BEFORE" || phase === "CODING";
      expect(response.status).toBe(blocked ? 423 : 200);
      expect(response.headers.get("x-request-id")).toBe("pr21-test");
      if (blocked) {
        expect(await response.json()).toEqual({
          error: { code: "contest_running", message: expect.any(String) },
        });
        expect(flow.pageFetch).not.toHaveBeenCalled();
        expect(flow.llm).not.toHaveBeenCalled();
        expect(flow.ladderLlm).not.toHaveBeenCalled();
        expect(await store.db.select().from(diagnoses)).toHaveLength(0);
        expect(await store.db.select().from(attempts)).toMatchObject(
          route === "diagnose" ? [{ status: "new", diagnosingSince: null }] : [],
        );
      } else if (route === "diagnose") {
        const events: DiagnoseEvent[] = [];
        await readSse(response.body!, (event) => events.push(event));
        expect(events.at(-1)?.event).toBe("done");
        expect(flow.llm).toHaveBeenCalledOnce();
      }
    },
  );
  it(`${route} allows CF API failure and logs only a code with requestId`, async () => {
    const flow = setup("FINISHED");
    const initial = route === "diagnose" ? await invoke(flow, route) : undefined;
    flow.advance("CODING");
    flow.apiFetch.mockRejectedValueOnce(new Error("private upstream detail"));
    const response =
      initial && !(initial instanceof Response)
        ? await flow.diagnose(request(), initial.attemptId)
        : await invoke(flow, route);
    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) throw new Error("Expected route response");
    expect(response.status).toBe(200);
    if (route === "diagnose") await readSse(response.body!, () => {});
    expect(flow.log).toHaveBeenCalledWith({ requestId: "pr21-test", code: "contest_check_failed" });
    expect(JSON.stringify(flow.log.mock.calls)).not.toContain("private upstream detail");
  });
}
it.each(["atcoder", "custom"] as const)("skips CF requests for %s problems", async (judge) => {
  await store.db.update(problems).set({ judge, contestId: "4" }).where(eq(problems.id, problemId));
  const flow = setup("CODING");
  const { attemptId }: { attemptId: string } = await (await flow.attempt()).json();
  const response = await flow.diagnose(request(), attemptId);
  expect(response.status).toBe(200);
  await readSse(response.body!, () => {});
  expect(flow.apiFetch).not.toHaveBeenCalled();
});
it("rechecks before reusing a cached diagnosis and uses the shared ten-minute cache", async () => {
  const flow = setup("FINISHED");
  const { attemptId }: { attemptId: string } = await (await flow.attempt()).json();
  await readSse((await flow.diagnose(request(), attemptId)).body!, () => {});
  expect(flow.apiFetch).toHaveBeenCalledOnce();
  flow.advance("CODING");
  expect((await flow.diagnose(request(), attemptId)).status).toBe(423);
  expect(flow.llm).toHaveBeenCalledOnce();
  expect(flow.apiFetch).toHaveBeenCalledTimes(2);
});

it("skips the contest check with zero network calls in DEMO_REPLAY mode", async () => {
  const { guardContest } = await import("@/src/services/contest-guard");
  const contestList = vi.fn(async () => {
    throw new Error("network");
  });
  vi.stubEnv("DEMO_REPLAY", "1");
  try {
    await expect(
      guardContest({ judge: "codeforces", contestId: "4" }, { cfApi: { contestList } as never }),
    ).resolves.toBeUndefined();
    expect(contestList).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
  }
});
