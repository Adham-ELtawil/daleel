import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createDb } from "@/src/db/client";
import { migrateDb } from "@/src/db/migrate";
import { seed } from "@/src/db/seed";
import { getProblemByExternalId } from "@/src/db/repo/problems";
import { recordLlmCall, sumLlmCostSince } from "@/src/db/repo/llm-calls";
import { MetaEnvSchema } from "@/src/env";
import { createMetaClient } from "@/src/llm/meta-client";
import { diagnoseStepConfig } from "@/src/llm/prompts/diagnose";
import { ladderStepConfig } from "@/src/llm/prompts/ladder";
import { explainStepConfig } from "@/src/llm/prompts/explain";
import { revealHint } from "@/src/services/attempt-service";
import { diagnoseAttempt } from "@/src/services/diagnose-service";
import { explainAttempt } from "@/src/services/explain-service";
import { createHandlers } from "@/src/services/handlers";

export async function runSmokeExplain(
  id: string,
  env: Record<string, string | undefined>,
  deps: { fetch?: typeof fetch; print?: (line: string) => void } = {},
): Promise<number> {
  const apiKey = env.MODEL_API_KEY ?? "";
  const print = (line: string) =>
    (deps.print ?? console.log)(apiKey ? line.split(apiKey).join("***") : line);
  if (!apiKey || id !== "4A") {
    print(
      !apiKey
        ? "smoke:explain skipped: MODEL_API_KEY is not set. Add it to .env.local (see .env.example)."
        : "Usage: pnpm smoke:explain 4A",
    );
    return 2;
  }
  const store = createDb({ url: "file::memory:" });
  try {
    const parsed = MetaEnvSchema.parse(env);
    const { db } = store;
    await migrateDb(db);
    await seed(db);
    const problem = (await getProblemByExternalId(db, "codeforces", id))!;
    const now = Date.now;
    const { callStructured: llm } = createMetaClient({
      apiKey,
      baseURL: parsed.MODEL_API_BASE_URL,
      fetch: deps.fetch,
      dailyBudgetUsd: parsed.DAILY_BUDGET_USD,
      promptCacheRetention: parsed.PROMPT_CACHE_RETENTION,
      getSpentTodayUsd: () => sumLlmCostSince(db, 0),
      logCall: (record) =>
        recordLlmCall(db, { ...record, error: record.error ? "llm_error" : null }, now()),
    });
    const fields = {
      problemId: problem.id,
      language: "cpp17",
      code: readFileSync("docs/examples/cf-4A-watermelon/student.cpp", "utf8"),
    };
    const request = new Request("http://smoke", { method: "POST", body: JSON.stringify(fields) });
    const response = await createHandlers({ db: async () => db }).attempt(request);
    if (!response.ok) throw new Error("attempt_failed");
    const { attemptId }: { attemptId: string } = await response.json();
    const ladder = { config: ladderStepConfig(env), llm };
    await diagnoseAttempt(
      { db, now, ladder, llm, config: diagnoseStepConfig(env), log: print },
      attemptId,
      (event) => {
        if (event.event === "error") throw new Error("diagnosis_failed");
      },
    );
    for (let level = 0; level < 3; level++) await revealHint({ db, now, ladder }, attemptId);
    const result = await explainAttempt(
      { db, now, llm, config: explainStepConfig(env) },
      attemptId,
    );
    print(result.explanation.explanation_md);
    for (const fix of result.explanation.fix) print(`L${fix.line}: ${fix.old}\n${fix.new}`);
    print(
      `frames: ${result.trace.frames.length}, cost_usd=${(await sumLlmCostSince(db, 0)).toFixed(6)}`,
    );
    return 0;
  } catch (error) {
    print(`smoke:explain failed (${error instanceof Error ? error.name : "UnknownError"}).`);
    return 1;
  } finally {
    store.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  runSmokeExplain(process.argv[2] ?? "4A", process.env).then((code) => process.exit(code));
}
