import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createDb } from "@/src/db/client";
import { migrateDb } from "@/src/db/migrate";
import { seed } from "@/src/db/seed";
import { getProblemByExternalId } from "@/src/db/repo/problems";
import { recordLlmCall, sumLlmCostSince } from "@/src/db/repo/llm-calls";
import { llmCalls } from "@/src/db/schema";
import { MetaEnvSchema } from "@/src/env";
import { createMetaClient } from "@/src/llm/meta-client";
import { diagnoseStepConfig } from "@/src/llm/prompts/diagnose";
import { ladderStepConfig } from "@/src/llm/prompts/ladder";
import type { DiagnosisPublic } from "@/src/llm/schemas/diagnosis";
import { revealHint } from "@/src/services/attempt-service";
import { diagnoseAttempt } from "@/src/services/diagnose-service";
import { createHandlers } from "@/src/services/handlers";

export async function runSmokeRecheck(
  id: string,
  env: Record<string, string | undefined>,
  deps: { fetch?: typeof fetch; print?: (line: string) => void } = {},
): Promise<number> {
  const apiKey = env.MODEL_API_KEY ?? "";
  const print = (line: string) =>
    (deps.print ?? console.log)(apiKey ? line.split(apiKey).join("***") : line);
  if (!apiKey) {
    print(
      "smoke:recheck skipped: MODEL_API_KEY is not set. Add it to .env.local (see .env.example), then re-run.",
    );
    return 2;
  }
  if (id !== "4A") {
    print("Usage: pnpm smoke:recheck 4A");
    return 2;
  }
  let store: ReturnType<typeof createDb> | undefined;
  let dir: string | undefined;
  try {
    const parsed = MetaEnvSchema.parse(env);
    dir = mkdtempSync(join(tmpdir(), "daleel-recheck-"));
    store = createDb({ url: `file:${join(dir, "smoke.db")}` });
    const { db } = store;
    await migrateDb(db);
    await seed(db);
    const problem = (await getProblemByExternalId(db, "codeforces", id))!;
    const now = Date.now;
    const client = createMetaClient({
      apiKey,
      baseURL: parsed.MODEL_API_BASE_URL,
      fetch: deps.fetch,
      dailyBudgetUsd: parsed.DAILY_BUDGET_USD,
      promptCacheRetention: parsed.PROMPT_CACHE_RETENTION,
      getSpentTodayUsd: () => sumLlmCostSince(db, 0),
      logCall: (record) =>
        recordLlmCall(db, { ...record, error: record.error ? "llm_error" : null }, now()),
    });
    const ladder = { config: ladderStepConfig(env), llm: client.callStructured };
    const handlers = createHandlers({ db: async () => db, now, ladder });
    const create = async (code: string, parentAttemptId?: string) => {
      const response = await handlers.attempt(
        new Request("http://localhost/api/attempts", {
          method: "POST",
          body: JSON.stringify({ problemId: problem.id, code, language: "cpp17", parentAttemptId }),
        }),
      );
      if (!response.ok) throw new Error("attempt_failed");
      const result: { attemptId: string } = await response.json();
      return result.attemptId;
    };
    const diagnose = async (attemptId: string) => {
      let result: DiagnosisPublic | undefined;
      await diagnoseAttempt(
        {
          db,
          now,
          ladder,
          llm: client.callStructured,
          config: diagnoseStepConfig(env),
          log: print,
        },
        attemptId,
        (event) => {
          if (event.event === "diagnosis") result = event.data.public;
          if (event.event === "error") throw new Error("diagnosis_failed");
        },
      );
      if (!result) throw new Error("diagnosis_failed");
      return result;
    };
    const path = "docs/examples/cf-4A-watermelon";
    const parent = await create(readFileSync(`${path}/student.cpp`, "utf8"));
    await diagnose(parent);
    for (let level = 1; level <= 4; level++) {
      const { hint } = await revealHint({ db, now, ladder }, parent);
      print(`${hint.level}. ${hint.title}`);
    }
    const child = await create(readFileSync(`${path}/fixed.cpp`, "utf8"), parent);
    const result = await diagnose(child);
    for (const field of ["bug_found", "bug_class", "confidence"] as const)
      print(`${field}: ${result[field]}`);
    const calls = await db.select({ cost: llmCalls.costUsd }).from(llmCalls);
    const cost = Math.round(calls.reduce((total, call) => total + call.cost, 0) * 1e6) / 1e6;
    print(`calls: ${calls.length}, cost_usd=${cost.toFixed(6)}`);
    return 0;
  } catch (error) {
    print(
      `smoke:recheck failed (${error instanceof Error ? error.name : "UnknownError"}). Check the model configuration and API availability.`,
    );
    return 1;
  } finally {
    store?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  runSmokeRecheck(process.argv[2] ?? "4A", process.env).then((code) => process.exit(code));
}
