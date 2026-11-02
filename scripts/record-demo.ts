import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "@/src/db/client";
import { migrateDb } from "@/src/db/migrate";
import { seed } from "@/src/db/seed";
import { getProblemByExternalId } from "@/src/db/repo/problems";
import { recordLlmCall, sumLlmCostSince } from "@/src/db/repo/llm-calls";
import { users } from "@/src/db/schema";
import { examples } from "@/src/demo/examples";
import { RecordEnvSchema } from "@/src/env";
import { createMetaClient } from "@/src/llm/meta-client";
import { diagnoseStepConfig } from "@/src/llm/prompts/diagnose";
import { ladderStepConfig } from "@/src/llm/prompts/ladder";
import { explainStepConfig } from "@/src/llm/prompts/explain";
import { stressStepConfig } from "@/src/llm/prompts/stress";
import { translateStepConfig } from "@/src/llm/prompts/translate";
import { createRunner } from "@/src/runner/factory";
import { createReplayStore } from "@/src/llm/replay/store";
import { getCurrentUser } from "@/src/services/current-user";
import { diagnoseAttempt } from "@/src/services/diagnose-service";
import { attemptDetail, markAttempt, revealHint } from "@/src/services/attempt-service";
import { explainAttempt } from "@/src/services/explain-service";
import { createHandlers } from "@/src/services/handlers";

/** Shared real service flow, also used for offline verification against recordings. */
export async function runDemoFlows(
  db: Db,
  client: ReturnType<typeof createMetaClient>,
  env: Record<string, string | undefined>,
) {
  const now = Date.now;
  const ladder = { config: ladderStepConfig(env), llm: client.callStructured };
  const translate = { config: translateStepConfig(env), llm: client.callStructured };
  const stress =
    env.RUNNER_PROVIDER === "local"
      ? { config: stressStepConfig(env), llm: client.callStructured, runner: createRunner(env) }
      : undefined;
  const handlers = createHandlers({ db: async () => db, now, ladder });
  const user = await getCurrentUser(db);
  for (const example of examples) {
    await db.update(users).set({ locale: example.locale }).where(eq(users.id, user.id));
    const problem = await getProblemByExternalId(db, example.judge, example.id);
    if (!problem) throw new Error("demo_problem_missing");
    const create = async (file: string, parentAttemptId?: string) => {
      const response = await handlers.attempt(
        new Request("http://localhost/api/attempts", {
          method: "POST",
          body: JSON.stringify({
            problemId: problem.id,
            language: "cpp17",
            code: readFileSync(`docs/examples/${example.path}/${file}`, "utf8"),
            parentAttemptId,
          }),
        }),
      );
      if (!response.ok) throw new Error("demo_attempt_failed");
      const result: { attemptId: string } = await response.json();
      return result.attemptId;
    };
    const diagnose = async (id: string, expectedBug: boolean) => {
      let bugFound: boolean | undefined;
      let ladderReady = false;
      await diagnoseAttempt(
        {
          db,
          now,
          ladder,
          stress,
          llm: client.callStructured,
          config: diagnoseStepConfig(env),
          log: () => {},
        },
        id,
        (event) => {
          if (event.event === "diagnosis") bugFound = event.data.public.bug_found;
          if (event.event === "ladder_ready") ladderReady = true;
        },
      );
      if (bugFound !== expectedBug || !ladderReady) throw new Error("demo_flow_failed");
      await attemptDetail({ db, now, translate }, id, example.locale === "en" ? "ar-EG" : "en");
    };
    const parent = await create("student.cpp");
    await diagnose(parent, true);
    await markAttempt({ db, now }, parent, "stuck");
    await explainAttempt(
      { db, now, llm: client.callStructured, config: explainStepConfig(env) },
      parent,
    );
    if (example.id === "4A") await diagnose(await create("fixed.cpp", parent), false);
  }
  const first = examples[0];
  const problem = await getProblemByExternalId(db, first.judge, first.id);
  if (!problem) throw new Error("demo_problem_missing");
  for (const locale of ["en", "ar-EG"] as const) {
    await db.update(users).set({ locale }).where(eq(users.id, user.id));
    const response = await handlers.attempt(
      new Request("http://localhost/api/attempts", {
        method: "POST",
        body: JSON.stringify({ problemId: problem.id, mode: "idea" }),
      }),
    );
    if (!response.ok) throw new Error("demo_attempt_failed");
    const { attemptId }: { attemptId: string } = await response.json();
    for (let level = 1; level <= 4; level++) {
      const { hint } = await revealHint({ db, now, ladder }, attemptId, locale);
      if (hint.level !== level) throw new Error("demo_flow_failed");
    }
  }
}

export async function runRecordDemo(
  env: Record<string, string | undefined>,
  deps: { fetch?: typeof fetch; print?: (line: string) => void; recordingsDir?: string } = {},
): Promise<number> {
  const print = deps.print ?? console.log;
  if (!env.MODEL_API_KEY) {
    print(
      "MODEL_API_KEY is not set. Add it to .env.local (see .env.example), then run pnpm record:demo.",
    );
    return 2;
  }
  const parsed = RecordEnvSchema.safeParse({ ...env, DEMO_RECORD: "1" });
  if (!parsed.success || parsed.data.DEMO_REPLAY === "1") {
    print("Invalid recording env: disable DEMO_REPLAY and set a positive RECORD_MAX_USD.");
    return 2;
  }
  const config = parsed.data;
  const dir = mkdtempSync(join(tmpdir(), "daleel-record-"));
  const store = createDb({ url: `file:${join(dir, "record.db")}` });
  let total = 0;
  try {
    await migrateDb(store.db);
    await seed(store.db);
    const client = createMetaClient({
      apiKey: config.MODEL_API_KEY,
      baseURL: config.MODEL_API_BASE_URL,
      fetch: deps.fetch,
      promptCacheRetention: config.PROMPT_CACHE_RETENTION,
      dailyBudgetUsd: Math.min(config.DAILY_BUDGET_USD, config.RECORD_MAX_USD),
      getSpentTodayUsd: () => sumLlmCostSince(store.db, 0),
      replay: {
        mode: config.DEMO_RECORD === "1" ? "record" : "off",
        store: createReplayStore(deps.recordingsDir),
        // RECORD_REUSE=1 keeps existing recordings (e.g. add runner-free ladders after a local-runner run).
        reuse: process.env.RECORD_REUSE === "1",
      },
      logCall: async (record) => {
        total += record.costUsd;
        print(`${record.step}: ${record.status}, cost $${record.costUsd.toFixed(6)}`);
        await recordLlmCall(
          store.db,
          { ...record, error: record.error ? "llm_error" : null },
          Date.now(),
        );
      },
    });
    await runDemoFlows(store.db, client, env);
    return 0;
  } catch (error) {
    // Never print API bodies, prompts, or error messages (which may echo a key).
    print(`record:demo failed (${error instanceof Error ? error.name : "UnknownError"}).`);
    return 1;
  } finally {
    print(`Total cost: $${total.toFixed(6)}`);
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  runRecordDemo(process.env).then((code) => process.exit(code));
}
