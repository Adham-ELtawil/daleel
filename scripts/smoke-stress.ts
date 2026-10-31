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
import { stressStepConfig } from "@/src/llm/prompts/stress";
import { createRunner } from "@/src/runner/factory";
import type { Runner } from "@/src/runner/runner";
import { diagnoseAttempt } from "@/src/services/diagnose-service";
import { createHandlers } from "@/src/services/handlers";

export async function runSmokeStress(
  id: string,
  env: Record<string, string | undefined>,
  deps: { fetch?: typeof fetch; print?: (line: string) => void; runner?: Runner } = {},
): Promise<number> {
  const apiKey = env.MODEL_API_KEY ?? "";
  const print = (line: string) =>
    (deps.print ?? console.log)(apiKey ? line.split(apiKey).join("***") : line);
  if (!apiKey) {
    print(
      "smoke:stress skipped: MODEL_API_KEY is not set. Add it to .env.local (see .env.example), then re-run.",
    );
    return 2;
  }
  if (env.RUNNER_PROVIDER !== "local") {
    print("smoke:stress requires RUNNER_PROVIDER=local.");
    return 2;
  }
  if (id !== "4A" && id !== "1A") {
    print("Usage: pnpm smoke:stress 4A | 1A");
    return 2;
  }
  let store: ReturnType<typeof createDb> | undefined;
  let dir: string | undefined;
  try {
    const parsed = MetaEnvSchema.parse(env);
    const runner = deps.runner ?? createRunner(env);
    dir = mkdtempSync(join(tmpdir(), "daleel-stress-"));
    store = createDb({ url: `file:${join(dir, "smoke.db")}` });
    const { db } = store;
    await migrateDb(db);
    await seed(db);
    const problem = (await getProblemByExternalId(db, "codeforces", id))!;
    const client = createMetaClient({
      apiKey,
      baseURL: parsed.MODEL_API_BASE_URL,
      fetch: deps.fetch,
      dailyBudgetUsd: parsed.DAILY_BUDGET_USD,
      promptCacheRetention: parsed.PROMPT_CACHE_RETENTION,
      getSpentTodayUsd: () => sumLlmCostSince(db, 0),
      logCall: (record) =>
        recordLlmCall(db, { ...record, error: record.error ? "llm_error" : null }, Date.now()),
    });
    const slug = id === "4A" ? "watermelon" : "theatre-square";
    const response = await createHandlers({ db: async () => db }).attempt(
      new Request("http://localhost/api/attempts", {
        method: "POST",
        body: JSON.stringify({
          problemId: problem.id,
          language: "cpp17",
          code: readFileSync(`docs/examples/cf-${id}-${slug}/student.cpp`, "utf8"),
        }),
      }),
    );
    if (!response.ok) throw new Error("attempt_failed");
    const { attemptId }: { attemptId: string } = await response.json();
    let completed = false;
    await diagnoseAttempt(
      {
        db,
        now: Date.now,
        config: diagnoseStepConfig(env),
        llm: client.callStructured,
        log: print,
        stress: { runner, config: stressStepConfig(env), llm: client.callStructured },
        ladder: { config: ladderStepConfig(env), llm: client.callStructured },
      },
      attemptId,
      (event) => {
        if (event.event === "stress") {
          for (const [field, value] of Object.entries(event.data.result))
            print(`${field}: ${value}`);
        }
        if (event.event === "diagnosis" && !event.data.public.bug_found) print("status: skipped");
        if (event.event === "done") completed = true;
      },
    );
    if (!completed) throw new Error("diagnosis_failed");
    const calls = await db.select({ cost: llmCalls.costUsd }).from(llmCalls);
    print(
      `calls: ${calls.length}, cost_usd=${calls.reduce((sum, call) => sum + call.cost, 0).toFixed(6)}`,
    );
    return 0;
  } catch (error) {
    print(
      `smoke:stress failed (${error instanceof Error ? error.name : "UnknownError"}). Check the model and runner configuration.`,
    );
    return 1;
  } finally {
    store?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  runSmokeStress(process.argv[2] ?? "4A", process.env).then((code) => process.exit(code));
}
