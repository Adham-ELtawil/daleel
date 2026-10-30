import { connect, getDb } from "@/src/db/client";
import { recordLlmCall, sumLlmCostSince } from "@/src/db/repo/llm-calls";
import { MetaEnvSchema } from "@/src/env";
import { createMetaClient } from "@/src/llm/meta-client";
import { diagnoseStepConfig } from "@/src/llm/prompts/diagnose";
import { createDiagnoseHandler } from "@/src/services/diagnose-handler";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return createDiagnoseHandler({
    db: () => connect(getDb()),
    now: Date.now,
    config: diagnoseStepConfig(process.env),
    llm: async (config, messages, options) => {
      const env = MetaEnvSchema.parse(process.env);
      const db = await connect(getDb());
      return createMetaClient({
        apiKey: env.MODEL_API_KEY,
        baseURL: env.MODEL_API_BASE_URL,
        dailyBudgetUsd: env.DAILY_BUDGET_USD,
        promptCacheRetention: env.PROMPT_CACHE_RETENTION,
        getSpentTodayUsd: () => sumLlmCostSince(db, Math.floor(Date.now() / 86400000) * 86400000),
        logCall: (record) =>
          recordLlmCall(db, { ...record, error: record.error ? "llm_error" : null }, Date.now()),
      }).callStructured(config, messages, options);
    },
  })(request, (await params).id);
}
