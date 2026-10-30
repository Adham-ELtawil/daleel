import { connect, getDb } from "@/src/db/client";
import { recordLlmCall, sumLlmCostSince } from "@/src/db/repo/llm-calls";
import { MetaEnvSchema } from "@/src/env";
import {
  createMetaClient,
  type CallOptions,
  type ChatMessage,
  type LlmStepConfig,
} from "@/src/llm/meta-client";
import { ladderStepConfig } from "@/src/llm/prompts/ladder";
import { createHandlers } from "./handlers";

export async function callModel<T>(
  config: LlmStepConfig,
  messages: ChatMessage[],
  options: CallOptions<T>,
) {
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
}
export function attemptHandlers() {
  return createHandlers({
    db: () => connect(getDb()),
    ladder: { config: ladderStepConfig(process.env), llm: callModel },
  });
}
