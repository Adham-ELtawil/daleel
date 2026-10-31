import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";
import { EvalEnvSchema } from "@/src/env";
import { codeLines } from "@/src/domain/code-lines";
import { validateDiagnosis } from "@/src/domain/diagnosis-validate";
import { ExpectedSchema, scoreCase, summarize } from "@/src/eval/score";
import { createMetaClient, type LlmCallRecord } from "@/src/llm/meta-client";
import { buildDiagnoseMessages, diagnoseStepConfig } from "@/src/llm/prompts/diagnose";
import { DiagnosisSchema, type Diagnosis } from "@/src/llm/schemas/diagnosis";
import sources from "@/tests/fixtures/eval-sources.json";
import { createDb } from "@/src/db/client";
import { migrateDb } from "@/src/db/migrate";
import { insertProblem } from "@/src/db/repo/problems";
import { diagnoses } from "@/src/db/schema";
import { createHandlers } from "@/src/services/handlers";
import { stressAttempt, type StressDeps, type StressPublic } from "@/src/services/stress";
import { stressStepConfig } from "@/src/llm/prompts/stress";
import { createRunner } from "@/src/runner/factory";
import type { Runner } from "@/src/runner/runner";

const ProblemSchema = z.object({
  judge: z.enum(["codeforces", "atcoder"]),
  externalId: z.string().min(1),
  title: z.string().min(1),
  statementMd: z.string().min(1),
  inputSpecMd: z.string().min(1),
  outputSpecMd: z.string().min(1),
  notesMd: z.string().nullable(),
  timeLimitMs: z.number().positive(),
  memoryLimitMb: z.number().positive(),
  rating: z.number().nullable(),
  tags: z.array(z.string()),
  samples: z.array(z.object({ input: z.string().min(1), output: z.string().min(1) })).min(1),
});
type Result = {
  id: string;
  expected: z.infer<typeof ExpectedSchema>;
  diagnosis: Diagnosis | null;
  score: ReturnType<typeof scoreCase>;
  records: LlmCallRecord[];
  error: string | null;
  stress: StressPublic | null;
};
type Deps = {
  fetch?: typeof fetch;
  print?: (line: string) => void;
  now?: () => number;
  resultsDir?: string;
  createClient?: typeof createMetaClient;
  runner?: Runner;
};

export async function runEval(
  args: string[],
  env: Record<string, string | undefined>,
  deps: Deps = {},
): Promise<number> {
  const print = deps.print ?? console.log;
  if (!env.MODEL_API_KEY) {
    print("MODEL_API_KEY is not set. Add it to .env.local (see .env.example), then run pnpm eval.");
    return 2;
  }
  const now = deps.now ?? Date.now;
  const stamp = new Date(now()).toISOString().slice(0, 16).replace("T", "-").replace(":", "");
  const results: Result[] = [];
  let spent = 0;
  let exitCode = 0;
  let config;
  let ids: string[];
  let stressRunner: Runner | undefined;
  try {
    const { values } = parseArgs({
      args,
      options: {
        only: { type: "string" },
        effort: { type: "string" },
        stress: { type: "boolean" },
      },
    });
    const effort =
      values.effort !== undefined
        ? z.enum(["low", "medium", "high"]).parse(values.effort)
        : env.EFFORT_DIAGNOSE;
    config = EvalEnvSchema.parse({ ...env, EFFORT_DIAGNOSE: effort });
    const all = sources.map((c) => c.id);
    ids = [...new Set(values.only?.split(",") ?? all)];
    if (ids.some((id) => !all.includes(id))) throw new Error("Unknown case");
    if (values.stress) stressRunner = deps.runner ?? createRunner({ RUNNER_PROVIDER: "local" });
  } catch {
    print(
      "Invalid args/env. Use pnpm eval [--only id1,id2] [--effort low|medium|high] [--stress].",
    );
    return 2;
  }
  const records: LlmCallRecord[] = [];
  const budget = new AbortController();
  const redact = (text: string) => text.split(config.MODEL_API_KEY).join("***");
  const client = (deps.createClient ?? createMetaClient)({
    apiKey: config.MODEL_API_KEY,
    baseURL: config.MODEL_API_BASE_URL,
    fetch: deps.fetch,
    now,
    promptCacheRetention: config.PROMPT_CACHE_RETENTION,
    dailyBudgetUsd: Math.min(config.DAILY_BUDGET_USD, config.EVAL_MAX_USD),
    getSpentTodayUsd: async () => spent,
    logCall: (rec) => {
      spent += rec.costUsd;
      if (spent >= config.EVAL_MAX_USD) budget.abort();
      records.push({ ...rec, error: rec.error ? redact(rec.error) : null });
    },
  });
  const lines = [
    `Eval ${stamp}: model=${config.MODEL_DIAGNOSE}, effort=${config.EFFORT_DIAGNOSE} (UTC)`,
    "",
    "| id | expected | got | confidence | classOk | lineOverlap | mentions | latency ms | reasoning tokens | cost $ | counterexample |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  try {
    for (const id of ids) {
      if (spent >= config.EVAL_MAX_USD) {
        lines.push(`Aborted: EVAL_MAX_USD cap reached ($${spent.toFixed(6)}).`);
        exitCode = 1;
        break;
      }
      const dir = `tests/fixtures/eval/${id}`;
      const code = readFileSync(`${dir}/code.cpp`, "utf8");
      const expected = ExpectedSchema.parse(
        JSON.parse(readFileSync(`${dir}/expected.json`, "utf8")),
      );
      if (expected.lines.some((line) => line > codeLines(code).length))
        throw new Error("Invalid expected line");
      const problem = ProblemSchema.parse(JSON.parse(readFileSync(`${dir}/problem.json`, "utf8")));
      const start = records.length;
      let diagnosis: Diagnosis | null = null;
      let error: string | null = null;
      let stress: StressPublic | null = null;
      try {
        diagnosis = validateDiagnosis(
          await client.callStructured(
            diagnoseStepConfig({ ...env, EFFORT_DIAGNOSE: config.EFFORT_DIAGNOSE }),
            buildDiagnoseMessages({
              problem,
              locale: "en",
              attempt: {
                code,
                language: "cpp17",
                verdictReported: expected.bug_class === "time_complexity" ? "TLE" : "WA",
                verdictTestNo: null,
                studentNote: null,
              },
            }),
            {
              zod: DiagnosisSchema,
              cacheKey: `problem:${problem.externalId}`,
              signal: budget.signal,
            },
          ),
          code,
        );
      } catch (err) {
        error = err instanceof Error ? err.name : "UnknownError";
        exitCode = 1;
      }
      if (diagnosis && stressRunner) {
        stress = await evalStress(problem, code, diagnosis, {
          runner: stressRunner,
          llm: client.callStructured,
          config: stressStepConfig(env),
          now,
        });
      }
      const score = diagnosis
        ? scoreCase(expected, diagnosis)
        : { classOk: false, lineOverlap: false, mentions: 0, score: 0 };
      const calls = records.slice(start);
      results.push({ id, expected, diagnosis, score, records: calls, error, stress });
      lines.push(
        `| ${id} | ${expected.bug_class} | ${diagnosis?.bug_class ?? "error"} | ${diagnosis?.confidence.toFixed(2) ?? "n/a"} | ${score.classOk} | ${score.lineOverlap} | ${score.mentions} | ${calls.reduce((s, r) => s + r.latencyMs, 0)} | ${calls.reduce((s, r) => s + r.reasoningTokens, 0)} | ${calls.reduce((s, r) => s + r.costUsd, 0).toFixed(6)} | ${stress?.status ?? "n/a"} |`,
      );
    }
  } catch {
    lines.push("Eval failed: invalid or unreadable case fixtures.");
    exitCode = 1;
  }
  const totals = {
    ...summarize(results.map((r) => r.score)),
    costUsd: spent,
    verified: results.filter((r) => r.stress?.status === "verified").length,
  };
  lines.push(
    "",
    `Class: ${totals.classOk}/${totals.cases}; lines: ${totals.lineOverlap}/${totals.cases}; score: ${totals.score}/${totals.cases * 2}; counterexample: ${stressRunner ? `verified ${totals.verified}/${totals.cases}` : "n/a"}`,
    `Total cost: $${spent.toFixed(6)}`,
  );
  const output = redact(lines.join("\n"));
  print(output);
  const resultsDir = deps.resultsDir ?? "eval/results";
  mkdirSync(resultsDir, { recursive: true });
  const report = {
    date: stamp,
    model: config.MODEL_DIAGNOSE,
    effort: config.EFFORT_DIAGNOSE,
    selected: ids,
    exitCode,
    results,
    totals,
  };
  writeFileSync(join(resultsDir, `${stamp}.json`), redact(JSON.stringify(report, null, 2)) + "\n");
  writeFileSync(join(resultsDir, `${stamp}.md`), output + "\n");
  return exitCode;
}

async function evalStress(
  problem: z.infer<typeof ProblemSchema>,
  code: string,
  diagnosis: Diagnosis,
  deps: Omit<StressDeps, "db">,
) {
  const dir = mkdtempSync(join(tmpdir(), "daleel-eval-stress-"));
  const store = createDb({ url: `file:${join(dir, "case.db")}` });
  try {
    const { db } = store;
    await migrateDb(db);
    const { id: problemId } = await insertProblem(
      db,
      { ...problem, url: null, contestId: null },
      deps.now(),
    );
    const response = await createHandlers({ db: async () => db, now: deps.now }).attempt(
      new Request("http://localhost/api/attempts", {
        method: "POST",
        body: JSON.stringify({ problemId, code, language: "cpp17" }),
      }),
    );
    if (!response.ok) throw new Error("attempt_failed");
    const { attemptId }: { attemptId: string } = await response.json();
    await db.insert(diagnoses).values({
      id: "eval-diagnosis",
      attemptId,
      resultJson: JSON.stringify(diagnosis),
      bugClass: diagnosis.bug_class,
      topicsJson: JSON.stringify(diagnosis.topics),
      confidence: diagnosis.confidence,
      model: deps.config.model,
      reasoningEffort: deps.config.reasoningEffort,
      createdAt: deps.now(),
    });
    return await stressAttempt({ ...deps, db }, attemptId);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  runEval(process.argv.slice(2), process.env).then((code) => process.exit(code));
}
