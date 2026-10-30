import { z } from "zod";

// Parsed by diagnoseStepConfig before any model call; no secrets are included.
export const DiagnoseEnvSchema = z.object({
  MODEL_DIAGNOSE: z.string().min(1).default("muse-spark-1.3"),
  EFFORT_DIAGNOSE: z.enum(["minimal", "low", "medium", "high", "xhigh"]).default("high"),
  MAXTOK_DIAGNOSE: z.coerce.number().int().positive().default(16000),
});

export const LadderEnvSchema = z.object({
  MODEL_LADDER: z.string().min(1).default("muse-spark-1.3"),
  EFFORT_LADDER: z.enum(["minimal", "low", "medium", "high", "xhigh"]).default("low"),
  MAXTOK_LADDER: z.coerce.number().int().positive().default(8000),
});

export const MetaEnvSchema = z.object({
  MODEL_API_KEY: z.string().default(""),
  MODEL_API_BASE_URL: z.url().default("https://api.meta.ai/v1"),
  DAILY_BUDGET_USD: z.coerce.number().positive().default(10),
  PROMPT_CACHE_RETENTION: z.enum(["in_memory", "24h"]).default("24h"),
  DEMO_REPLAY: z.enum(["0", "1"]).default("0"),
  DEMO_RECORD: z.enum(["0", "1"]).default("0"),
});

export const RecordEnvSchema = MetaEnvSchema.extend({
  RECORD_MAX_USD: z.coerce.number().positive().default(0.5),
});

export const EvalEnvSchema = MetaEnvSchema.extend(DiagnoseEnvSchema.shape).extend({
  EVAL_MAX_USD: z.preprocess(
    (value) => (value === "" ? NaN : value),
    z.coerce.number().nonnegative().default(1),
  ),
});
