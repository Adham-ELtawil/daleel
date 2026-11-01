import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  attempts,
  diagnoses,
  hintLadders,
  hintReveals,
  problems,
  stressRuns,
  users,
  walkthroughs,
} from "@/src/db/schema";
import { getProblem } from "@/src/db/repo/problems";
import { canExplain, attemptDetail, revealHint } from "@/src/services/attempt-service";
import { createHandlers } from "@/src/services/handlers";
import { createDiagnoseHandler } from "@/src/services/diagnose-handler";
import { diagnoseAttempt } from "@/src/services/diagnose-service";
import { stressAttempt } from "@/src/services/stress";
import { ensureLadder, type LadderDeps } from "@/src/services/ladder-service";
import { explainStepConfig } from "@/src/llm/prompts/explain";
import { diagnoseStepConfig } from "@/src/llm/prompts/diagnose";
import { stressStepConfig } from "@/src/llm/prompts/stress";
import { ladderStepConfig } from "@/src/llm/prompts/ladder";
import { BudgetReached, SchemaError } from "@/src/llm/meta-client";
import { ReplayMiss } from "@/src/llm/replay/store";
import { HintLadderSchema } from "@/src/llm/schemas/ladder";
import { DiagnosisSchema } from "@/src/llm/schemas/diagnosis";
import { ExplanationSchema } from "@/src/llm/schemas/explanation";
import { tempDb } from "@/tests/db/helpers";
import { fakeStressRunner } from "@/tests/runner/stress-fake";
import rows from "@/tests/fixtures/llm/ladder-service.json";
import fixture from "@/tests/fixtures/llm/idea-ladder.json";
import diagnosis from "@/tests/fixtures/llm/diagnosis-a.json";
import explanation from "@/tests/fixtures/llm/explanation-a.json";

let store: Awaited<ReturnType<typeof tempDb>>;
const id = rows.attempt.id;
const request = (body: unknown = {}) =>
  new Request("http://localhost/api", {
    method: "POST",
    headers: { "x-request-id": "pr26-test" },
    body: JSON.stringify(body),
  });
const good = () => HintLadderSchema.parse(structuredClone(fixture));
const setup = () => {
  const llm = vi.fn<LadderDeps["llm"]>(async () => good());
  const ladder = {
    llm,
    config: ladderStepConfig({
      MODEL_LADDER: "fake-model",
      EFFORT_LADDER: "medium",
      MAXTOK_LADDER: "9000",
    }),
  };
  const deps = { db: store.db, now: () => 1000, ladder };
  const log = vi.fn();
  return { deps, llm, handlers: createHandlers({ ...deps, db: async () => store.db, log }), log };
};
beforeEach(async () => {
  store = await tempDb();
  await store.db
    .insert(users)
    .values({ ...rows.user, handle: "guest_local", role: "student", locale: "en" });
  await store.db.insert(problems).values({ ...rows.problem, judge: "codeforces" });
});
afterEach(() => store.cleanup());
const idea = () =>
  store.db.insert(attempts).values({
    ...rows.attempt,
    mode: "idea",
    code: "",
    language: "cpp17",
    locale: "en",
    status: "new",
    maxHintLevel: 0,
  });

it("creates an idea attempt without code, with empty-code hash and null verdicts", async () => {
  const { handlers } = setup();
  const response = await handlers.attempt(request({ problemId: rows.problem.id, mode: "idea" }));
  expect(response.status).toBe(200);
  const { attemptId }: { attemptId: string } = await response.json();
  expect(await store.db.select().from(attempts).get()).toMatchObject({
    id: attemptId,
    mode: "idea",
    code: "",
    codeHash: createHash("sha256").update("").digest("hex"),
    language: "cpp17",
    verdictReported: null,
    verdictTestNo: null,
    parentAttemptId: null,
  });
});
it.each([{ code: "" }, { code: "code" }, { parentAttemptId: "parent" }])(
  "rejects idea payload extras %j",
  async (extra) => {
    const response = await setup().handlers.attempt(
      request({ problemId: rows.problem.id, mode: "idea", ...extra }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid" } });
  },
);
it.each([undefined, "code"])(
  "still requires code in mode %s and defaults stored code attempts",
  async (mode) => {
    const { handlers } = setup();
    expect(
      (await handlers.attempt(request({ problemId: rows.problem.id, language: "cpp17", mode })))
        .status,
    ).toBe(400);
    const valid = await handlers.attempt(
      request({ problemId: rows.problem.id, language: "cpp17", code: "code", mode }),
    );
    expect(valid.status).toBe(200);
    expect(await store.db.select().from(attempts).get()).toMatchObject({ mode: "code" });
  },
);
it("checks the contest guard before saving idea attempts", async () => {
  const handlers = createHandlers({
    db: async () => store.db,
    log: vi.fn(),
    cfApi: {
      contestList: async () => [
        {
          id: 4,
          name: "fixture",
          type: "CF",
          phase: "CODING",
          frozen: false,
          durationSeconds: 7200,
        },
      ],
      problemsetProblems: async () => ({ problems: [], problemStatistics: [] }),
    },
  });
  const response = await handlers.attempt(request({ problemId: rows.problem.id, mode: "idea" }));
  expect(response.status).toBe(423);
  expect(await response.json()).toMatchObject({ error: { code: "contest_running" } });
  expect(await store.db.select().from(attempts)).toHaveLength(0);
});
it("reveals and caches idea hints 1..4 without diagnosis; fifth is 409; detail exposes mode and stays locked", async () => {
  await idea();
  const { deps, handlers, llm } = setup();
  for (let level = 1; level <= 4; level++) {
    const result = await revealHint(deps, id);
    expect(result).toMatchObject({ hint: { level }, remaining: 4 - level });
    expect(llm).toHaveBeenCalledOnce();
    expect(await attemptDetail(deps, id)).toMatchObject({
      attempt: { mode: "idea", maxHintLevel: level },
      canExplain: false,
    });
  }
  const [config, messages] = llm.mock.calls[0];
  expect(config).toMatchObject({
    step: "idea",
    model: "fake-model",
    reasoningEffort: "medium",
    maxCompletionTokens: 9000,
  });
  expect(messages[1].content).toContain("<problem ");
  expect(messages[1].content).toContain(rows.problem.statementMd);
  expect(JSON.stringify(messages)).not.toMatch(/<student_code>|<diagnosis>/);
  const response = await handlers.nextHint(request(), id);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "no_more_hints" } });
  expect(await store.db.select().from(diagnoses)).toHaveLength(0);
  expect(await store.db.select().from(stressRuns)).toHaveLength(0);
  expect(await store.db.select().from(walkthroughs)).toHaveLength(0);
  expect(await store.db.select().from(hintReveals)).toHaveLength(4);
});
it.each(["fence", "question"])(
  "retries then safely falls back for an idea %s violation",
  async (violation) => {
    await idea();
    const { deps, llm } = setup();
    const bad = good();
    if (violation === "fence") bad.levels[3].body_md = "```cpp\nint answer = 0;\n```";
    else bad.levels[0].question_back = null;
    llm.mockResolvedValue(bad);
    const result = await ensureLadder({ ...deps, ...deps.ladder }, id, "en");
    expect(llm).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain("```");
    expect(result.levels[0].question_back).toBeTruthy();
    expect(result.levels[violation === "fence" ? 3 : 0]).not.toEqual(
      bad.levels[violation === "fence" ? 3 : 0],
    );
    expect(await store.db.select().from(hintLadders)).toHaveLength(1);
  },
);
it("uses Arabic ladder style, repairs public text and caches each locale while preserving reveals", async () => {
  await idea();
  const { deps, llm } = setup();
  await revealHint(deps, id, "en");
  llm.mockResolvedValue({
    levels: good().levels.map((hint) => ({
      ...hint,
      title: "Parity هنا",
      body_md: "input هنا",
      question_back: hint.level === 1 ? "split هنا؟" : null,
    })),
  });
  const result = await attemptDetail(deps, id, "ar-EG");
  expect(result.revealedHints[0]).toMatchObject({
    title: "الـ Parity هنا",
    body_md: "الـ input هنا",
    question_back: "الـ split هنا؟",
  });
  expect(llm.mock.calls[1][1][0].content).toContain("Egyptian Arabic colloquial");
  await attemptDetail(deps, id, "ar-EG");
  expect(llm).toHaveBeenCalledTimes(2);
  expect(await store.db.select().from(hintReveals)).toHaveLength(1);
});
it.each(["en", "ar-EG"] as const)(
  "maps idea replay misses to a localized 503 in %s without changing code replay",
  async (locale) => {
    await idea();
    const { handlers, llm, log } = setup();
    llm.mockRejectedValue(new ReplayMiss("idea", "0".repeat(64)));
    const response = await handlers.nextHint(request({ locale }), id);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: {
        code: "idea_replay_unavailable",
        message:
          locale === "en"
            ? "Idea hints are not recorded for this demo problem yet. Try another demo or return with your code."
            : "تلميحات الفكرة لسه مش متسجلة للمسألة دي في الديمو. جرّب ديمو تاني أو ارجع بالكود بتاعك.",
      },
    });
    expect(log).toHaveBeenCalledWith({ requestId: "pr26-test", code: "idea_replay_unavailable" });
    await store.db.update(attempts).set({ mode: "code" }).where(eq(attempts.id, id));
    await store.db.insert(diagnoses).values(rows.diagnosis);
    llm.mockRejectedValue(new ReplayMiss("ladder", "0".repeat(64)));
    expect((await handlers.nextHint(request(), id)).status).toBe(500);
  },
);
it.each([
  [new BudgetReached(10, 10), "budget_reached"],
  [new SchemaError("private model detail"), "llm_error"],
] as const)("maps idea model failures to 503 %s", async (error, code) => {
  await idea();
  const { handlers, llm } = setup();
  llm.mockRejectedValue(error);
  const response = await handlers.nextHint(request(), id);
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: { code } });
  expect(await store.db.select().from(hintReveals)).toHaveLength(0);
});
it("rejects idea diagnosis in both handler and service before making a call or writing pipeline data", async () => {
  await idea();
  const llm = vi.fn(async () => DiagnosisSchema.parse(diagnosis));
  const { deps } = setup();
  const diagnoseDeps = { ...deps, llm, config: diagnoseStepConfig({}), log: vi.fn() };
  const response = await createDiagnoseHandler({ ...diagnoseDeps, db: async () => store.db })(
    request(),
    id,
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "idea_attempt" } });
  await expect(diagnoseAttempt(diagnoseDeps, id, vi.fn())).rejects.toMatchObject({
    status: 409,
    code: "idea_attempt",
  });
  expect(llm).not.toHaveBeenCalled();
  expect(await store.db.select().from(diagnoses)).toHaveLength(0);
});
it("never unlocks explanation for ideas and rejects explanation and stress before their model calls", async () => {
  await idea();
  await store.db
    .update(attempts)
    .set({ status: "stuck", maxHintLevel: 4 })
    .where(eq(attempts.id, id));
  expect(canExplain(4, "stuck", "idea")).toBe(false);
  const { deps } = setup();
  expect(await attemptDetail(deps, id)).toMatchObject({
    attempt: { mode: "idea" },
    canExplain: false,
  });
  const llm = vi.fn(async () => ExplanationSchema.parse(explanation));
  const handlers = createHandlers({
    db: async () => store.db,
    explain: { llm, config: explainStepConfig({}) },
  });
  const response = await handlers.explain(request(), id);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "idea_attempt" } });
  expect(llm).not.toHaveBeenCalled();
  await expect(
    stressAttempt(
      {
        db: store.db,
        now: deps.now,
        runner: fakeStressRunner(),
        config: stressStepConfig({}),
        llm: vi.fn(),
      },
      id,
    ),
  ).rejects.toMatchObject({ status: 409, code: "idea_attempt" });
  const history = await handlers.history(new Request("http://localhost/api/me/attempts"));
  expect(await history.json()).toMatchObject({ items: [{ mode: "idea" }] });
  expect(await getProblem(store.db, rows.problem.id)).toBeTruthy();
});
