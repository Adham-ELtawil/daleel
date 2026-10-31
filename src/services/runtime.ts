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
import { stressStepConfig } from "@/src/llm/prompts/stress";
import { createRunner } from "@/src/runner/factory";
import { createReplayStore } from "@/src/llm/replay/store";
import { createHandlers } from "./handlers";

export async function callModel<T>(
  config: LlmStepConfig,
  messages: ChatMessage[],
  options: CallOptions<T>,
) {
  const env = MetaEnvSchema.parse(process.env);
  if (env.DEMO_RECORD === "1") throw new Error("DEMO_RECORD is only supported by pnpm record:demo");
  const db = await connect(getDb());
  return createMetaClient({
    apiKey: env.MODEL_API_KEY,
    baseURL: env.MODEL_API_BASE_URL,
    dailyBudgetUsd: env.DAILY_BUDGET_USD,
    promptCacheRetention: env.PROMPT_CACHE_RETENTION,
    replay: { mode: env.DEMO_REPLAY === "1" ? "replay" : "off", store: createReplayStore() },
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
export function stressDeps(env: Record<string, string | undefined>) {
  const runner = createRunner(env);
  return runner.name === "none"
    ? undefined
    : { runner, config: stressStepConfig(env), llm: callModel };
}
