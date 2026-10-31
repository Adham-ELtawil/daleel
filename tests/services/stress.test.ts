import { existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { attempts, diagnoses, problems, stressRuns, users } from "@/src/db/schema";
import { StoredDiagnosisSchema, StoredStressTestsSchema } from "@/src/db/json";
import { createNoneRunner } from "@/src/runner/none";
import { RunnerError, type Runner, type RunResult } from "@/src/runner/runner";
import { DiagnosisSchema, type Diagnosis } from "@/src/llm/schemas/diagnosis";
import type { StressDeps } from "@/src/services/stress";
import { tempDb } from "@/tests/db/helpers";
import rows from "@/tests/fixtures/llm/ladder-service.json";
import fixture from "@/tests/fixtures/llm/diagnosis-a.json";
import planFixture from "@/tests/fixtures/llm/stress-a.json";

let store: Awaited<ReturnType<typeof tempDb>>;
const id = rows.attempt.id;
const plan = { ...planFixture, checker: "exact_tokens" as const };
const diagnosis = { ...DiagnosisSchema.parse(fixture), suspect_inputs: [] };
const output = (stdout: string, status: RunResult["status"] = "ok"): RunResult => ({
  status,
  stdout,
  stderr: "",
  timeMs: 1,
  exitCode: status === "ok" ? 0 : 1,
});
function fakeRunner() {
  return {
    name: "fake",
    compile: vi.fn<Runner["compile"]>(async (source) => ({
      ok: true,
      binaryId: source === planFixture.brute_cpp ? "brute" : "student",
    })),
    run: vi.fn<Runner["run"]>(async (binary, input) =>
      output(
        binary === "student" || (Number(input) >= 4 && Number(input) % 2 === 0) ? "YES\n" : "NO\n",
      ),
    ),
    dispose: vi.fn<Runner["dispose"]>(async () => {}),
  };
}
async function api() {
  expect(
    existsSync("src/services/stress.ts"),
    "PR-16 stress execution and persistence are missing",
  ).toBe(true);
  return import("@/src/services/stress");
}
async function deps() {
  await api();
  const { stressStepConfig } = await import("@/src/llm/prompts/stress");
  return {
    db: store.db,
    now: () => 1000,
    runner: fakeRunner(),
    config: stressStepConfig({}),
    llm: vi.fn<StressDeps["llm"]>(async () => structuredClone(plan)),
    log: vi.fn<(code: string) => void>(),
  };
}
const saved = () => store.db.select().from(stressRuns).where(eq(stressRuns.attemptId, id)).get();
async function setDiagnosis(patch: Partial<Diagnosis>) {
  await store.db
    .update(diagnoses)
    .set({
      resultJson: JSON.stringify(
        StoredDiagnosisSchema.parse({ value: { ...diagnosis, ...patch }, recordedAt: null }),
      ),
    })
    .where(eq(diagnoses.attemptId, id));
}
beforeEach(async () => {
  store = await tempDb();
  await store.db.insert(users).values({ ...rows.user, role: "student", locale: "en" });
  await store.db.insert(problems).values({ ...rows.problem, judge: "codeforces" });
  await store.db
    .insert(attempts)
    .values({ ...rows.attempt, language: "cpp17", locale: "en", status: "diagnosed" });
  await store.db
    .insert(diagnoses)
    .values({ ...rows.diagnosis, resultJson: JSON.stringify(diagnosis) });
});
afterEach(() => {
  store.cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("verifies the first mismatch on test 2 with raw runner outputs and keeps brute code private", async () => {
  const d = await deps();
  d.runner.run.mockImplementation(async (binary, input) =>
    output(
      binary === "student" && input === "2\n"
        ? "YES\n"
        : Number(input) >= 4 && Number(input) % 2 === 0
          ? "YES\n"
          : "NO\n",
    ),
  );
  const result = await (await api()).stressAttempt(d, id);
  expect(result).toEqual({
    status: "verified",
    failing_input: "2\n",
    expected_output: "NO\n",
    actual_output: "YES\n",
    compile_output: null,
    source: "test",
    contradiction: false,
  });
  expect(Object.keys(result).sort()).toEqual([
    "actual_output",
    "compile_output",
    "contradiction",
    "expected_output",
    "failing_input",
    "source",
    "status",
  ]);
  expect(JSON.stringify(result)).not.toContain(planFixture.brute_cpp);
  expect(await saved()).toMatchObject({
    status: "verified",
    bruteCode: planFixture.brute_cpp,
    failingInput: "2\n",
    expectedOutput: "NO\n",
    actualOutput: "YES\n",
    runner: "fake",
  });
  expect(d.runner.run.mock.calls.map(([binary, input]) => [binary, input])).toEqual([
    ["brute", "8\n"],
    ["student", "8\n"],
    ["brute", "1\n"],
    ["student", "1\n"],
    ["brute", "2\n"],
    ["student", "2\n"],
  ]);
  expect(d.runner.dispose.mock.calls.flat().sort()).toEqual(["brute", "student"]);
  expect(d.llm).toHaveBeenCalledWith(
    d.config,
    expect.any(Array),
    expect.objectContaining({
      attemptId: id,
      userId: rows.user.id,
      cacheKey: `problem:${rows.problem.id}`,
    }),
  );
});
it("requires the brute to pass ALL samples before running the student", async () => {
  const d = await deps();
  await store.db.update(problems).set({
    samplesJson: JSON.stringify([
      { input: "8\n", output: "YES\n" },
      { input: "1\n", output: "NO\n" },
    ]),
  });
  d.runner.run.mockResolvedValue(output("YES\n"));
  expect(await (await api()).stressAttempt(d, id)).toMatchObject({
    status: "brute_untrusted",
    failing_input: null,
  });
  expect(d.runner.run.mock.calls.map(([binary, input]) => [binary, input])).toEqual([
    ["brute", "8\n"],
    ["brute", "1\n"],
  ]);
  expect(d.runner.dispose).toHaveBeenCalledTimes(2);
  expect(await saved()).toMatchObject({ status: "brute_untrusted", expectedOutput: null });
});
it.each(["tle", "re"] as const)("does not trust a brute with sample status %s", async (status) => {
  const d = await deps();
  d.runner.run.mockResolvedValue(output("YES\n", status));
  expect(await (await api()).stressAttempt(d, id)).toMatchObject({ status: "brute_untrusted" });
});
it("returns capped student compiler output and stops before compiling the brute", async () => {
  const d = await deps();
  d.runner.compile.mockResolvedValue({
    ok: false,
    output: Array.from({ length: 40 }, (_, n) => `error ${n}`).join("\n"),
  });
  const result = await (await api()).stressAttempt(d, id);
  expect(result.status).toBe("compile_error");
  expect(result.compile_output?.split("\n")).toHaveLength(30);
  expect(await saved()).toMatchObject({ compileOutput: result.compile_output });
  expect(d.runner.compile).toHaveBeenCalledOnce();
  expect(d.runner.run).not.toHaveBeenCalled();
});
it("marks brute compilation failures untrusted and hides their diagnostics", async () => {
  const d = await deps();
  d.runner.compile
    .mockResolvedValueOnce({ ok: true, binaryId: "student" })
    .mockResolvedValueOnce({ ok: false, output: "private brute compiler output" });
  const result = await (await api()).stressAttempt(d, id);
  expect(result).toMatchObject({ status: "brute_untrusted", compile_output: null });
  expect(JSON.stringify(result)).not.toContain("private brute");
  expect(d.runner.dispose).toHaveBeenCalledWith("student");
});
it("skips any_valid without compiling either program", async () => {
  const d = await deps();
  d.llm.mockResolvedValue({ ...plan, checker: "any_valid" });
  expect(await (await api()).stressAttempt(d, id)).toMatchObject({ status: "skipped" });
  expect(d.runner.compile).not.toHaveBeenCalled();
  expect(await saved()).toMatchObject({ status: "skipped" });
});
it("skips runner none without an LLM call", async () => {
  const d = await deps();
  expect(await (await api()).stressAttempt({ ...d, runner: createNoneRunner() }, id)).toMatchObject(
    { status: "skipped" },
  );
  expect(d.llm).not.toHaveBeenCalled();
  expect(await saved()).toMatchObject({
    status: "skipped",
    runner: "none",
    bruteCode: null,
  });
  expect(StoredStressTestsSchema.parse(JSON.parse((await saved())!.testsJson))).toEqual({
    tests: [],
    source: null,
    contradiction: false,
  });
});
it("skips Python attempts because the runner supports only C++17", async () => {
  const d = await deps();
  await store.db.update(attempts).set({ language: "python3" });
  expect(await (await api()).stressAttempt(d, id)).toMatchObject({ status: "skipped" });
  expect(d.llm).not.toHaveBeenCalled();
});
it("uses the official sample as a counterexample after the trust gate", async () => {
  const d = await deps();
  d.runner.run.mockImplementation(async (binary) => output(binary === "brute" ? "yes\n" : "NO\n"));
  expect(await (await api()).stressAttempt(d, id)).toMatchObject({
    status: "verified",
    source: "sample",
    failing_input: "8\n",
    expected_output: "YES\n",
    actual_output: "NO\n",
  });
  expect(d.runner.run).toHaveBeenCalledTimes(2);
});
it("prioritizes diagnosis suspects, deduplicates plan inputs and caps them at 12", async () => {
  const d = await deps();
  await setDiagnosis({
    suspect_inputs: [{ input: "2\n", expected_output: "wrong model guess", why: "suspect" }],
  });
  d.llm.mockResolvedValue({
    ...plan,
    tests: Array.from({ length: 12 }, (_, n) => ({ input: `${n + 1}\n`, purpose: "small" })),
  });
  expect(await (await api()).stressAttempt(d, id)).toMatchObject({
    status: "verified",
    failing_input: "2\n",
    expected_output: "NO\n",
  });
  const { tests } = StoredStressTestsSchema.parse(JSON.parse((await saved())!.testsJson));
  expect(tests).toHaveLength(12);
  expect(tests[0]).toEqual({ input: "2\n", purpose: "suspect" });
  expect(tests.filter((test) => test.input === "2\n")).toHaveLength(1);
});
it("uses problem limits, doubles brute time and obeys the runner ceilings", async () => {
  const d = await deps();
  await (await api()).stressAttempt(d, id);
  expect(d.runner.run.mock.calls[0][2]).toEqual({ timeMs: 2000, memoryMb: 64, outputKb: 64 });
  expect(d.runner.run.mock.calls[1][2]).toEqual({ timeMs: 1000, memoryMb: 64, outputKb: 64 });
  await store.db.update(problems).set({ timeLimitMs: 5000, memoryLimitMb: 1024 });
  d.runner.run.mockClear();
  await (await api()).stressAttempt(d, id);
  expect(
    d.runner.run.mock.calls.every(
      ([, , limits]) => limits.timeMs === 2000 && limits.memoryMb === 256,
    ),
  ).toBe(true);
});
it.each(["tle", "re"] as const)(
  "skips brute %s on a proposed test then verifies the next test",
  async (status) => {
    const d = await deps();
    d.runner.run.mockImplementation(async (binary, input) =>
      output(
        input === "1\n" ? "" : binary === "brute" && input === "2\n" ? "NO\n" : "YES\n",
        binary === "brute" && input === "1\n" ? status : "ok",
      ),
    );
    expect(await (await api()).stressAttempt(d, id)).toMatchObject({
      status: "verified",
      failing_input: "2\n",
    });
    expect(
      d.runner.run.mock.calls.some(([binary, input]) => binary === "student" && input === "1\n"),
    ).toBe(false);
  },
);
it.each(["tle", "re", "mle", "ole"] as const)(
  "verifies a student %s even if partial stdout matches",
  async (status) => {
    const d = await deps();
    d.runner.run.mockImplementation(async (binary, input) =>
      output(
        input === "8\n" ? "YES\n" : "NO\n",
        binary === "student" && input === "1\n" ? status : "ok",
      ),
    );
    expect(await (await api()).stressAttempt(d, id)).toMatchObject({
      status: "verified",
      failing_input: "1\n",
    });
  },
);
it("uses the floating checker for both samples and proposed tests", async () => {
  const d = await deps();
  d.llm.mockResolvedValue({ ...plan, checker: "float_1e6" });
  await store.db.update(problems).set({ samplesJson: '[{"input":"8\\n","output":"1"}]' });
  d.runner.run.mockImplementation(async (binary) =>
    output(binary === "brute" ? "1.0000001" : "1.0000002"),
  );
  expect(await (await api()).stressAttempt(d, id)).toMatchObject({
    status: "no_mismatch",
    contradiction: false,
  });
});
it.each(["runner", "llm", "schema"] as const)(
  "persists a safe error on %s failure without changing diagnosis status",
  async (boundary) => {
    const d = await deps();
    if (boundary === "runner")
      d.runner.run.mockRejectedValueOnce(new RunnerError("runner_down", "private runner detail"));
    if (boundary === "llm") d.llm.mockRejectedValueOnce(new Error("private model detail"));
    if (boundary === "schema") d.llm.mockResolvedValue({ ...plan, tests: [] });
    expect(await (await api()).stressAttempt(d, id)).toMatchObject({
      status: "error",
      failing_input: null,
      compile_output: null,
    });
    expect(await saved()).toMatchObject({ status: "error" });
    expect((await store.db.select().from(attempts).get())!.status).toBe("diagnosed");
    expect(d.log).toHaveBeenCalledWith("stress_error");
    expect(JSON.stringify(d.log.mock.calls)).not.toContain("private");
  },
);
it("upserts one row and clears a previous counterexample when runner is disabled", async () => {
  const d = await deps();
  await (await api()).stressAttempt(d, id);
  const first = (await saved())!;
  await (await api()).stressAttempt({ ...d, runner: createNoneRunner() }, id);
  expect(await store.db.select().from(stressRuns)).toHaveLength(1);
  expect(await saved()).toMatchObject({
    id: first.id,
    status: "skipped",
    failingInput: null,
    expectedOutput: null,
    actualOutput: null,
    bruteCode: null,
    compileOutput: null,
  });
});
it("flags verified evidence when the diagnosis found no bug without re-diagnosing", async () => {
  const d = await deps();
  await setDiagnosis({ bug_found: false, bug_class: "none" });
  expect(await (await api()).stressAttempt(d, id)).toMatchObject({
    status: "verified",
    contradiction: true,
  });
  expect(d.llm).toHaveBeenCalledOnce();
});
it.each([0.39, 0.4])("flags low-confidence no_mismatch at confidence %s", async (confidence) => {
  const d = await deps();
  await setDiagnosis({ confidence });
  d.runner.run.mockResolvedValue(output("YES\n"));
  expect(await (await api()).stressAttempt(d, id)).toMatchObject({
    status: "no_mismatch",
    contradiction: confidence < 0.4,
  });
});
it.each([
  ["time_complexity", "ok"],
  ["edge_case", "tle"],
] as const)("flags a %s diagnosis contradicted by student status %s", async (bug_class, status) => {
  const d = await deps();
  await setDiagnosis({ bug_class });
  d.runner.run.mockImplementation(async (binary, input) =>
    output(
      input === "8\n" ? "YES\n" : binary === "student" ? "YES\n" : "NO\n",
      binary === "student" && input === "1\n" ? status : "ok",
    ),
  );
  expect(await (await api()).stressAttempt(d, id)).toMatchObject({
    status: "verified",
    contradiction: true,
  });
  expect(d.llm).toHaveBeenCalledOnce();
});
it("ends stress after 30 seconds and aborts a stalled model request", async () => {
  const d = await deps();
  const { stressAttempt } = await api();
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
  const running = stressAttempt(d, id);
  await ready;
  await vi.advanceTimersByTimeAsync(120000);
  expect(await running).toMatchObject({ status: "error" });
  expect(signal?.aborted).toBe(true);
  expect(d.runner.compile).not.toHaveBeenCalled();
  expect(await saved()).toMatchObject({ status: "error" });
});
it("cleans a compilation that finishes after the deadline without running it", async () => {
  const d = await deps();
  const { stressAttempt } = await api();
  let complete!: (value: Awaited<ReturnType<Runner["compile"]>>) => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  d.runner.compile.mockImplementationOnce(
    async () =>
      new Promise((resolve) => {
        complete = resolve;
        started();
      }),
  );
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const running = stressAttempt(d, id);
  await ready;
  await vi.advanceTimersByTimeAsync(120000);
  expect(await running).toMatchObject({ status: "error" });
  complete({ ok: true, binaryId: "late" });
  await vi.advanceTimersByTimeAsync(0);
  expect(d.runner.dispose).toHaveBeenCalledWith("late");
  expect(d.runner.compile).toHaveBeenCalledOnce();
  expect(d.runner.run).not.toHaveBeenCalled();
});
