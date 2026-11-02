import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  attempts,
  diagnoses,
  diagnosisTranslations,
  hintLadders,
  hintReveals,
  stressRuns,
  walkthroughs,
} from "@/src/db/schema";
import { StoredDiagnosisSchema } from "@/src/db/json";
import { seed } from "@/src/db/seed";
import { BudgetReached, SchemaError, OutputTruncated, MetaApiError } from "@/src/llm/meta-client";
import { diagnoseStepConfig } from "@/src/llm/prompts/diagnose";
import { ladderStepConfig } from "@/src/llm/prompts/ladder";
import { HintLadderSchema } from "@/src/llm/schemas/ladder";
import { DiagnosisSchema, toPublic } from "@/src/llm/schemas/diagnosis";
import { getProblemByExternalId } from "@/src/db/repo/problems";
import { diagnoseAttempt, type DiagnoseDeps } from "@/src/services/diagnose-service";
import { createDiagnoseHandler } from "@/src/services/diagnose-handler";
import { createHandlers } from "@/src/services/handlers";
import { readSse, type DiagnoseEvent } from "@/src/services/sse";
import { tempDb } from "@/tests/db/helpers";
import fixture from "@/tests/fixtures/llm/diagnosis-a.json";
import ladderFixture from "@/tests/fixtures/llm/ladder-a.json";
import type { LadderDeps } from "@/src/services/ladder-service";
import { stressStepConfig } from "@/src/llm/prompts/stress";
import type { StressDeps } from "@/src/services/stress";
import { fakeStressRunner } from "@/tests/runner/stress-fake";
import stressPlan from "@/tests/fixtures/llm/stress-a.json";

const code = readFileSync("docs/examples/cf-4A-watermelon/student.cpp", "utf8");
const result = DiagnosisSchema.parse(fixture);
const config = diagnoseStepConfig({ MODEL_DIAGNOSE: "fake-model", EFFORT_DIAGNOSE: "low" });
const request = (body: unknown = {}) =>
  new Request("http://localhost/api", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "x-request-id": "pr10-test" },
  });
let store: Awaited<ReturnType<typeof tempDb>>;
let problemId: string;
let now: number;
async function attempt(patch: Partial<typeof attempts.$inferInsert> = {}) {
  const response = await createHandlers({ db: async () => store.db, now: () => now }).attempt(
    request({
      problemId,
      language: "cpp17",
      code,
      verdictReported: "WA",
      verdictTestNo: 5,
    }),
  );
  const { attemptId }: { attemptId: string } = await response.json();
  if (Object.keys(patch).length)
    await store.db.update(attempts).set(patch).where(eq(attempts.id, attemptId));
  return attemptId;
}
const status = async (id: string) =>
  (await store.db.select().from(attempts).where(eq(attempts.id, id)).get())?.status;
const diagnosisState = (id: string) =>
  store.db
    .select({ status: attempts.status, diagnosingSince: attempts.diagnosingSince })
    .from(attempts)
    .where(eq(attempts.id, id))
    .get();
const deps = () => ({
  db: store.db,
  llm: vi.fn<DiagnoseDeps["llm"]>(async () => result),
  config,
  now: () => now,
  ladder: {
    config: ladderStepConfig({}),
    llm: vi.fn<LadderDeps["llm"]>(async () => HintLadderSchema.parse(ladderFixture)),
  },
  log: vi.fn<(code: string) => void>(),
});
const stressDeps = () => ({
  ...deps(),
  stress: {
    config: stressStepConfig({}),
    runner: fakeStressRunner(),
    llm: vi.fn<StressDeps["llm"]>(async () => ({ ...stressPlan, checker: "exact_tokens" })),
  },
});
beforeEach(async () => {
  store = await tempDb();
  now = 1000;
  await seed(store.db, now);
  problemId = (await getProblemByExternalId(store.db, "codeforces", "4A"))!.id;
});

it("streams diagnosis -> stress -> ladder_ready -> done and reloads the same safe stress result", async () => {
  const id = await attempt();
  const d = stressDeps();
  const events: DiagnoseEvent[] = [];
  const response = await createDiagnoseHandler({ ...d, log: vi.fn(), db: async () => store.db })(
    request(),
    id,
  );
  await readSse(response.body!, (event) => events.push(event));
  expect(events.slice(3).map((event) => event.event)).toEqual([
    "diagnosis",
    "stress",
    "ladder_ready",
    "done",
  ]);
  const verified = {
    status: "verified",
    failing_input: "2\n",
    expected_output: "NO\n",
    actual_output: "YES\n",
    compile_output: null,
    source: "test",
    contradiction: false,
  };
  expect(events[4]).toEqual({ event: "stress", data: { result: verified } });
  expect(d.ladder.llm.mock.calls[0][1].map((message) => message.content).join("\n")).toContain(
    '"verified":true',
  );
  const detail = await createHandlers({ db: async () => store.db }).getAttempt(
    new Request("http://localhost/api"),
    id,
  );
  expect(await detail.json()).toMatchObject({ stress: verified });
  expect(JSON.stringify(events)).not.toContain(stressPlan.brute_cpp);
  expect(d.stress.llm).toHaveBeenCalledOnce();
});
it.each(["no_bug", "no_deps"])("skips stress for %s and still completes", async (reason) => {
  const id = await attempt();
  const d = stressDeps();
  if (reason === "no_bug")
    d.llm.mockResolvedValue({ ...result, bug_found: false, bug_class: "none" });
  const events: DiagnoseEvent[] = [];
  await diagnoseAttempt({ ...d, stress: reason === "no_deps" ? undefined : d.stress }, id, (e) =>
    events.push(e),
  );
  expect(events.slice(3).map((e) => e.event)).toEqual(["diagnosis", "ladder_ready", "done"]);
  expect(d.stress.llm).not.toHaveBeenCalled();
  expect(d.stress.runner.compile).not.toHaveBeenCalled();
});
it("preserves diagnosis and completes the ladder after a stress runner error", async () => {
  const id = await attempt();
  const d = stressDeps();
  d.stress.runner.compile.mockRejectedValueOnce(new Error("private runner detail"));
  const events: DiagnoseEvent[] = [];
  await diagnoseAttempt(d, id, (e) => events.push(e));
  expect(events.slice(3).map((e) => e.event)).toEqual([
    "diagnosis",
    "stress",
    "ladder_ready",
    "done",
  ]);
  expect(events[4]).toMatchObject({ data: { result: { status: "error" } } });
  expect(await status(id)).toBe("diagnosed");
  expect(d.log).toHaveBeenCalledWith("stress_error");
  expect(JSON.stringify(events)).not.toContain("private runner detail");
});
it("preserves stress source and contradiction across GET reload", async () => {
  const id = await attempt();
  const d = stressDeps();
  d.llm.mockResolvedValue({ ...result, bug_class: "time_complexity" });
  await diagnoseAttempt(d, id, () => {});
  const response = await createHandlers({ db: async () => store.db }).getAttempt(
    new Request("http://localhost/api"),
    id,
  );
  const detail = await response.json();
  expect(detail).toMatchObject({
    stress: { status: "verified", source: "test", contradiction: true },
  });
  expect(JSON.stringify(detail)).not.toContain(stressPlan.brute_cpp);
});
afterEach(() => {
  vi.useRealTimers();
  store.cleanup();
});

it("streams ordered stages, stores validated internals, and sends only the public diagnosis", async () => {
  const id = await attempt();
  const d = deps();
  d.llm.mockImplementation(async () => {
    expect(await status(id)).toBe("diagnosing");
    return {
      ...result,
      lines: [...result.lines, { start: 999, end: 999, role: "bug" }],
      topics: [" Math "],
    };
  });
  const response = await createDiagnoseHandler({ ...d, log: vi.fn(), db: async () => store.db })(
    request(),
    id,
  );
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  expect(response.headers.get("x-request-id")).toBe("pr10-test");
  const events: DiagnoseEvent[] = [];
  await readSse(response.body!, (event) => events.push(event));
  expect(events.map((e) => e.event)).toEqual([
    "stage",
    "stage",
    "stage",
    "diagnosis",
    "ladder_ready",
    "done",
  ]);
  expect(events[4]).toEqual({ event: "ladder_ready", data: { levels: 4 } });
  expect(await store.db.select().from(hintLadders)).toMatchObject([
    { attemptId: id, locale: "en" },
  ]);
  const expected = { ...result, topics: ["math"] };
  expect(events[3]).toEqual({
    event: "diagnosis",
    data: { public: toPublic(expected), replay: false, recordedAt: null },
  });
  expect(JSON.stringify(events)).not.toContain("_internal");
  const row = await store.db.select().from(diagnoses).where(eq(diagnoses.attemptId, id)).get();
  expect(StoredDiagnosisSchema.parse(JSON.parse(row!.resultJson))).toEqual({
    value: expected,
    recordedAt: null,
  });
  expect(row).toMatchObject({ model: "fake-model", reasoningEffort: "low" });
  expect(await status(id)).toBe("diagnosed");
  expect(d.llm).toHaveBeenCalledWith(
    config,
    expect.any(Array),
    expect.objectContaining({
      signal: expect.any(AbortSignal),
      zod: DiagnosisSchema,
      attemptId: id,
      userId: expect.any(String),
      cacheKey: `problem:${problemId}`,
    }),
  );
});

it("reuses an identical normalized attempt with zero LLM calls, including repeated requests", async () => {
  const first = await attempt();
  await diagnoseAttempt(deps(), first, () => {});
  const second = await attempt({ code: code.replace(/\n/g, "\r\n"), studentNote: "Another note" });
  const d = deps();
  const events: DiagnoseEvent[] = [];
  for (const id of [second, second]) await diagnoseAttempt(d, id, (event) => events.push(event));
  expect(d.llm).not.toHaveBeenCalled();
  expect(events.filter((e) => e.event === "diagnosis").map((e) => e.data)).toEqual([
    { public: toPublic(result), replay: false, recordedAt: null },
    { public: toPublic(result), replay: false, recordedAt: null },
  ]);
  expect(await status(second)).toBe("diagnosed");
  expect(await store.db.select().from(diagnoses)).toHaveLength(2);
});

it.each(["diagnosed", "error"] as const)(
  "explicit retry resets %s and regenerates diagnosis and hints",
  async (state) => {
    const id = await attempt();
    await diagnoseAttempt(stressDeps(), id, () => {});
    // A second matching diagnosis must not be reused by an explicit retry.
    await diagnoseAttempt(deps(), await attempt(), () => {});
    await store.db.insert(hintReveals).values({ attemptId: id, level: 1, revealedAt: now });
    await store.db.insert(diagnosisTranslations).values({
      id: "old-translation",
      attemptId: id,
      locale: "ar-EG",
      publicJson: JSON.stringify(toPublic(result)),
      createdAt: now,
    });
    await store.db.insert(hintLadders).values({
      id: "old-ar",
      attemptId: id,
      locale: "ar-EG",
      levelsJson: JSON.stringify(ladderFixture.levels),
      createdAt: now,
    });
    await store.db.insert(walkthroughs).values({
      id: "old-trace",
      attemptId: id,
      locale: "en",
      explanationJson: "{}",
      traceJson: "{}",
      createdAt: now,
    });
    await store.db
      .update(attempts)
      .set({ status: state, maxHintLevel: 1 })
      .where(eq(attempts.id, id));
    const d = deps();
    d.llm.mockImplementationOnce(async () => {
      expect(await diagnosisState(id)).toEqual({ status: "diagnosing", diagnosingSince: now });
      for (const table of [
        diagnoses,
        diagnosisTranslations,
        hintLadders,
        hintReveals,
        stressRuns,
        walkthroughs,
      ])
        expect(await store.db.select().from(table).where(eq(table.attemptId, id))).toEqual([]);
      return { ...result, public_summary: "Fresh diagnosis" };
    });
    const response = await createDiagnoseHandler({ ...d, log: vi.fn(), db: async () => store.db })(
      request({ retry: true }),
      id,
    );
    expect(response.status).toBe(200);
    const events: DiagnoseEvent[] = [];
    await readSse(response.body!, (event) => events.push(event));
    expect(
      await store.db
        .select()
        .from(diagnosisTranslations)
        .where(eq(diagnosisTranslations.attemptId, id)),
    ).toEqual([]);
    expect(d.llm).toHaveBeenCalledOnce();
    expect(d.ladder.llm).toHaveBeenCalledOnce();
    expect(events.find((event) => event.event === "diagnosis")).toMatchObject({
      data: { public: { public_summary: "Fresh diagnosis" } },
    });
    expect(await store.db.select().from(attempts).where(eq(attempts.id, id)).get()).toMatchObject({
      status: "diagnosed",
      maxHintLevel: 0,
    });
    expect(
      await store.db.select().from(hintLadders).where(eq(hintLadders.attemptId, id)),
    ).toHaveLength(1);
  },
);
it("clears stale translations when an expired diagnosis is generated again", async () => {
  const id = await attempt();
  await diagnoseAttempt(deps(), id, () => {});
  await store.db.insert(diagnosisTranslations).values({
    id: "expired-translation",
    attemptId: id,
    locale: "ar-EG",
    publicJson: JSON.stringify(toPublic(result)),
    createdAt: now,
  });
  now += 86400001;
  const d = deps();
  d.llm.mockResolvedValue({ ...result, public_summary: "Fresh diagnosis after expiry" });
  await diagnoseAttempt(d, id, () => {});
  expect(d.llm).toHaveBeenCalledOnce();
  expect(
    await store.db
      .select()
      .from(diagnosisTranslations)
      .where(eq(diagnosisTranslations.attemptId, id)),
  ).toEqual([]);
});
it.each([0, 150000, 150001, null])("retry obeys the stale claim at age %s", async (age) => {
  const id = await attempt();
  await diagnoseAttempt(deps(), id, () => {});
  now = 200000;
  await store.db
    .update(attempts)
    .set({ status: "diagnosing", diagnosingSince: age === null ? null : now - age })
    .where(eq(attempts.id, id));
  const d = deps();
  const response = await createDiagnoseHandler({ ...d, log: vi.fn(), db: async () => store.db })(
    request({ retry: true }),
    id,
  );
  const stale = age === null || age > 150000;
  expect(response.status).toBe(stale ? 200 : 409);
  if (stale) await readSse(response.body!, () => {});
  expect(d.llm).toHaveBeenCalledTimes(stale ? 1 : 0);
  expect(await store.db.select().from(diagnoses).where(eq(diagnoses.attemptId, id))).toHaveLength(
    1,
  );
  expect(
    await store.db.select().from(hintLadders).where(eq(hintLadders.attemptId, id)),
  ).toHaveLength(1);
});
it.each(["stress", "ladder"] as const)(
  "keeps the claim while %s is still running",
  async (phase) => {
    const id = await attempt();
    const d = stressDeps();
    let statusCode: number | undefined;
    const retry = async () => {
      const response = await createDiagnoseHandler({
        ...deps(),
        log: vi.fn(),
        db: async () => store.db,
      })(request({ retry: true }), id);
      statusCode = response.status;
      if (response.ok) await readSse(response.body!, () => {});
    };
    if (phase === "stress")
      d.stress.llm.mockImplementationOnce(async () => {
        await retry();
        return { ...stressPlan, checker: "exact_tokens" };
      });
    else
      d.ladder.llm.mockImplementationOnce(async () => {
        await retry();
        return HintLadderSchema.parse(ladderFixture);
      });
    await diagnoseAttempt(d, id, () => {});
    expect(statusCode).toBe(409);
    expect(await diagnosisState(id)).toEqual({ status: "diagnosed", diagnosingSince: null });
  },
);

it("ends a stalled model call after 120 seconds and aborts the request", async () => {
  const id = await attempt();
  const d = deps();
  const events: DiagnoseEvent[] = [];
  let signal: AbortSignal | undefined;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  d.llm.mockImplementationOnce(async (_config, _messages, options) => {
    signal = options.signal;
    started();
    return new Promise(() => {});
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const running = diagnoseAttempt(d, id, (event) => events.push(event));
  await ready;
  await vi.advanceTimersByTimeAsync(120000);
  expect(await status(id)).toBe("error");
  expect(signal?.aborted).toBe(true);
  expect(events.at(-1)).toMatchObject({ event: "error", data: { code: "llm_error" } });
  await running;
});

it.each([
  { locale: "ar-EG" },
  { language: "python3" },
  { verdictReported: "TLE" },
  { verdictTestNo: 6 },
  { code: code + "// changed" },
  { problemId: "other" },
] as const)("keeps distinct cache inputs separate: %j", async (patch) => {
  const first = await attempt();
  await diagnoseAttempt(deps(), first, () => {});
  const fields =
    "problemId" in patch
      ? { problemId: (await getProblemByExternalId(store.db, "codeforces", "1A"))!.id }
      : patch;
  const d = deps();
  await diagnoseAttempt(d, await attempt(fields), () => {});
  expect(d.llm).toHaveBeenCalledOnce();
});
it("expires cached diagnoses after 24 hours", async () => {
  await diagnoseAttempt(deps(), await attempt(), () => {});
  now += 86400001;
  const d = deps();
  await diagnoseAttempt(d, await attempt(), () => {});
  expect(d.llm).toHaveBeenCalledOnce();
});

it.each([
  [new BudgetReached(10, 10), "budget_reached"],
  [new SchemaError("private details"), "schema_error"],
  [new OutputTruncated(16000), "truncated"],
  [new MetaApiError("private details", 500), "llm_error"],
])("streams a safe %s error and updates status", async (error, code) => {
  const id = await attempt();
  const d = deps();
  d.llm.mockRejectedValueOnce(error);
  const events: DiagnoseEvent[] = [];
  await diagnoseAttempt(d, id, (event) => events.push(event));
  expect(events.at(-1)).toMatchObject({
    event: "error",
    data: { code, message: expect.any(String) },
  });
  expect(JSON.stringify(events)).not.toContain("private details");
  expect(events.some((e) => e.event === "done" || e.event === "diagnosis")).toBe(false);
  expect(await status(id)).toBe("error");
  expect(await store.db.select().from(diagnoses)).toHaveLength(0);
});
it("returns safe 404/409 JSON before streaming and never calls the LLM", async () => {
  const d = deps();
  const handler = createDiagnoseHandler({ ...d, log: vi.fn(), db: async () => store.db });
  for (const [id, expected] of [
    ["missing", 404],
    [await attempt({ status: "diagnosing", diagnosingSince: now }), 409],
  ] as const) {
    const response = await handler(request(), id);
    expect(response.status).toBe(expected);
    expect(await response.json()).toMatchObject({
      error: { code: expect.any(String), message: expect.any(String) },
    });
  }
  expect(d.llm).not.toHaveBeenCalled();
});

it.each([151000, null])("recovers a diagnosing attempt aged %s ms", async (age) => {
  now = 200000;
  const id = await attempt({
    status: "diagnosing",
    diagnosingSince: age === null ? null : now - age,
  });
  const d = deps();
  const events: DiagnoseEvent[] = [];
  await diagnoseAttempt(d, id, (event) => events.push(event));
  expect(d.llm).toHaveBeenCalledOnce();
  expect(events.at(-3)).toEqual({
    event: "diagnosis",
    data: { public: toPublic(result), replay: false, recordedAt: null },
  });
  expect(events.at(-1)).toEqual({ event: "done", data: {} });
  expect(await diagnosisState(id)).toEqual({ status: "diagnosed", diagnosingSince: null });
});

it.each([10000, 150000])(
  "rejects a diagnosing attempt aged %s ms without LLM calls",
  async (age) => {
    now = 200000;
    const id = await attempt({ status: "diagnosing", diagnosingSince: now - age });
    const d = deps();
    const response = await createDiagnoseHandler({ ...d, log: vi.fn(), db: async () => store.db })(
      request(),
      id,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "already_running" } });
    expect(d.llm).not.toHaveBeenCalled();
    expect(await diagnosisState(id)).toEqual({ status: "diagnosing", diagnosingSince: now - age });
  },
);

it("prepares the ladder in the attempt locale after successful diagnosis", async () => {
  const id = await attempt({ locale: "ar-EG" });
  const d = deps();
  await diagnoseAttempt(d, id, () => {});
  expect(await store.db.select().from(hintLadders)).toMatchObject([
    { attemptId: id, locale: "ar-EG" },
  ]);
  expect(JSON.stringify(d.ladder.llm.mock.calls[0][1])).toContain("Egyptian");
});
it.each(["en", "ar-EG"] as const)(
  "post-fixes only Arabic public diagnosis fields in %s",
  async (locale) => {
    const id = await attempt({ locale });
    const d = deps();
    const raw = {
      ...result,
      public_summary: "overflow محتمل",
      approach: { ...result.approach, student_idea_public: "`w` بيتقسم" },
    };
    d.llm.mockResolvedValue(raw);
    const events: DiagnoseEvent[] = [];
    await diagnoseAttempt(d, id, (event) => events.push(event));
    const saved = (await store.db
      .select()
      .from(diagnoses)
      .where(eq(diagnoses.attemptId, id))
      .get())!;
    const value = StoredDiagnosisSchema.parse(JSON.parse(saved.resultJson)).value;
    expect(value.public_summary).toBe(`${locale === "ar-EG" ? "الـ " : ""}${raw.public_summary}`);
    expect(value.approach.student_idea_public).toBe(
      `${locale === "ar-EG" ? "الـ " : ""}${raw.approach.student_idea_public}`,
    );
    expect(value.root_cause_internal).toBe(raw.root_cause_internal);
    expect(events.find((event) => event.event === "diagnosis")).toMatchObject({
      data: { public: toPublic(value) },
    });
    expect(d.llm).toHaveBeenCalledOnce();
  },
);
it("ends with diagnosis + done when ladder generation fails and logs a safe ladder error with requestId", async () => {
  const id = await attempt();
  const d = deps();
  d.ladder.llm.mockRejectedValueOnce(new Error("private ladder detail"));
  const log = vi.fn();
  const response = await createDiagnoseHandler({ ...d, db: async () => store.db, log })(
    request(),
    id,
  );
  const events: DiagnoseEvent[] = [];
  await readSse(response.body!, (event) => events.push(event));
  expect(events.slice(-2)).toEqual([
    { event: "diagnosis", data: { public: toPublic(result), replay: false, recordedAt: null } },
    { event: "done", data: {} },
  ]);
  expect(events.some((event) => event.event === "error" || event.event === "ladder_ready")).toBe(
    false,
  );
  expect(await status(id)).toBe("diagnosed");
  expect(log).toHaveBeenCalledWith({ requestId: "pr10-test", code: "ladder_error" });
  expect(JSON.stringify(log.mock.calls)).not.toContain("private ladder detail");
});

it.each(["diagnosed", "error"] as const)(
  "sets the claim timestamp and clears it after %s",
  async (outcome) => {
    const id = await attempt();
    const d = deps();
    let claimed: Awaited<ReturnType<typeof diagnosisState>>;
    d.llm.mockImplementationOnce(async () => {
      claimed = await diagnosisState(id);
      if (outcome === "error") throw new SchemaError("invalid_diagnosis");
      return result;
    });
    await diagnoseAttempt(d, id, () => {});
    expect(claimed).toEqual({ status: "diagnosing", diagnosingSince: now });
    expect(await diagnosisState(id)).toEqual({ status: outcome, diagnosingSince: null });
  },
);
