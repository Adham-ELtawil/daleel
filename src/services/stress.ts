import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import type { Db } from "@/src/db/client";
import { getProblem, type Problem } from "@/src/db/repo/problems";
import { StoredDiagnosisSchema, StoredStressTestsSchema } from "@/src/db/json";
import type { StressPublic } from "@/src/domain/stress-public";
import { attempts, diagnoses, stressRuns } from "@/src/db/schema";
import type { CallOptions, ChatMessage, LlmStepConfig } from "@/src/llm/meta-client";
import { buildStressMessages } from "@/src/llm/prompts/stress";
import type { Diagnosis } from "@/src/llm/schemas/diagnosis";
import { StressPlanSchema, type StressPlan } from "@/src/llm/schemas/stress";
import { RunnerOff } from "@/src/runner/none";
import {
  capOutput,
  compareOutputs,
  RunnerError,
  type Runner,
  type RunLimits,
  type RunResult,
} from "@/src/runner/runner";
import { HttpError } from "./http-error";

export type { StressPublic } from "@/src/domain/stress-public";
export type StressDeps = {
  db: Db;
  llm: (
    config: LlmStepConfig,
    messages: ChatMessage[],
    options: CallOptions<StressPlan>,
  ) => Promise<StressPlan>;
  config: LlmStepConfig;
  runner: Runner;
  now: () => number;
  log?: (code: string) => void;
};
const empty = (status: StressPublic["status"]): StressPublic => ({
  status,
  failing_input: null,
  expected_output: null,
  actual_output: null,
  compile_output: null,
  source: null,
  contradiction: false,
});

// Covers the stress LLM call (medium effort, often 10-40 s) plus compiles and runs.
export const STRESS_DEADLINE_MS = 120000;
async function withDeadline(job: (signal: AbortSignal) => Promise<StressPublic>) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      job(controller.signal),
      new Promise<StressPublic>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new RunnerError("stress_timeout", "Stress deadline reached"));
        }, STRESS_DEADLINE_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function executePlan(
  runner: Runner,
  problem: Problem,
  code: string,
  diagnosis: Diagnosis,
  plan: StressPlan,
  tests: StressPlan["tests"],
  binaries: string[],
  signal: AbortSignal,
): Promise<StressPublic> {
  if (plan.checker === "any_valid") return empty("skipped");
  const matches = (expected: string, actual: string) =>
    compareOutputs(expected, actual, plan.checker, problem.judge);
  const compile = async (source: string) => {
    signal.throwIfAborted();
    const compiled = await runner.compile(source, "cpp17");
    if (compiled.ok) binaries.push(compiled.binaryId);
    signal.throwIfAborted();
    return compiled;
  };
  const run = async (binary: string, input: string, limits: RunLimits) => {
    signal.throwIfAborted();
    const output = await runner.run(binary, input, limits);
    signal.throwIfAborted();
    return output;
  };
  const student = await compile(code);
  if (!student.ok)
    return { ...empty("compile_error"), compile_output: capOutput(student.output, 8192, 30) };
  const brute = await compile(plan.brute_cpp);
  if (!brute.ok) return empty("brute_untrusted");
  const limits = {
    timeMs: Math.max(1, Math.min(problem.timeLimitMs, 2000)),
    memoryMb: Math.max(1, Math.min(problem.memoryLimitMb, 256)),
    outputKb: 64,
  };
  const bruteLimits = { ...limits, timeMs: Math.min(limits.timeMs * 2, 2000) };
  const verified = (
    input: string,
    expected: string,
    actual: RunResult,
    source: "sample" | "test",
  ): StressPublic => ({
    ...empty("verified"),
    failing_input: input,
    expected_output: expected,
    actual_output: actual.stdout,
    source,
    contradiction:
      !diagnosis.bug_found ||
      (diagnosis.bug_class === "time_complexity" && actual.status === "ok") ||
      (diagnosis.bug_class !== "time_complexity" && actual.status === "tle"),
  });
  // Complete the entire trust gate before accepting even an official sample failure.
  for (const sample of problem.samples) {
    const output = await run(brute.binaryId, sample.input, bruteLimits);
    if (output.status !== "ok" || !matches(sample.output, output.stdout))
      return empty("brute_untrusted");
  }
  for (const sample of problem.samples) {
    const output = await run(student.binaryId, sample.input, limits);
    if (output.status !== "ok" || !matches(sample.output, output.stdout))
      return verified(sample.input, sample.output, output, "sample");
  }
  for (const test of tests) {
    const expected = await run(brute.binaryId, test.input, bruteLimits);
    if (expected.status !== "ok") continue;
    const actual = await run(student.binaryId, test.input, limits);
    if (actual.status !== "ok" || !matches(expected.stdout, actual.stdout))
      return verified(test.input, expected.stdout, actual, "test");
  }
  return { ...empty("no_mismatch"), contradiction: diagnosis.confidence < 0.4 };
}

export async function stressAttempt(
  { db, llm, config, runner, now, log }: StressDeps,
  attemptId: string,
): Promise<StressPublic> {
  const attempt = await db.select().from(attempts).where(eq(attempts.id, attemptId)).get();
  const problem = attempt && (await getProblem(db, attempt.problemId));
  if (!attempt || !problem) throw new HttpError(404, "not_found");
  if (attempt.mode === "idea") throw new HttpError(409, "idea_attempt");
  const stored = await db.select().from(diagnoses).where(eq(diagnoses.attemptId, attemptId)).get();
  if (!stored) throw new HttpError(409, "not_diagnosed");
  const diagnosis = StoredDiagnosisSchema.parse(JSON.parse(stored.resultJson)).value;
  const report = log ?? ((code: string) => console.error({ requestId: attemptId, code }));
  let bruteCode: string | null = null;
  let tests: StressPlan["tests"] = [];
  let result = empty("skipped");
  if (runner.name !== "none" && attempt.language === "cpp17") {
    try {
      result = await withDeadline(async (signal) => {
        const binaries: string[] = [];
        try {
          const plan = StressPlanSchema.parse(
            await llm(config, buildStressMessages({ problem, attempt, diagnosis }), {
              zod: StressPlanSchema,
              attemptId,
              userId: attempt.userId,
              cacheKey: `problem:${problem.id}`,
              signal,
            }),
          );
          bruteCode = plan.brute_cpp;
          tests = [
            ...diagnosis.suspect_inputs.map((test) => ({
              input: test.input,
              purpose: test.why.slice(0, 120),
            })),
            ...plan.tests,
          ]
            .filter((test, i, all) => all.findIndex((other) => other.input === test.input) === i)
            .slice(0, 12);
          return await executePlan(
            runner,
            problem,
            attempt.code,
            diagnosis,
            plan,
            tests,
            binaries,
            signal,
          );
        } finally {
          for (const binary of binaries) {
            try {
              await runner.dispose(binary);
            } catch {
              report("stress_cleanup_error");
            }
          }
        }
      });
    } catch (error) {
      result = empty(error instanceof RunnerOff ? "skipped" : "error");
      if (result.status === "error") report("stress_error");
    }
  }
  const fields = {
    status: result.status,
    runner: runner.name,
    bruteCode,
    testsJson: JSON.stringify(
      StoredStressTestsSchema.parse({
        tests,
        source: result.source,
        contradiction: result.contradiction,
      }),
    ),
    failingInput: result.failing_input,
    expectedOutput: result.expected_output,
    actualOutput: result.actual_output,
    compileOutput: result.compile_output,
    createdAt: now(),
  };
  await db
    .insert(stressRuns)
    .values({ id: ulid(now()), attemptId, ...fields })
    .onConflictDoUpdate({ target: stressRuns.attemptId, set: fields });
  return result;
}
