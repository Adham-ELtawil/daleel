import { z } from "zod";

export const SessionEnvSchema = z
  .object({
    SESSION_SECRET: z.string().default(""),
    NODE_ENV: z.string().optional(),
  })
  .refine(
    ({ SESSION_SECRET, NODE_ENV }) =>
      SESSION_SECRET.length >= 32 || (!SESSION_SECRET && NODE_ENV !== "production"),
    { path: ["SESSION_SECRET"], message: "SESSION_SECRET must contain at least 32 characters" },
  );

export const RunnerEnvSchema = z.object({
  RUNNER_PROVIDER: z.enum(["local", "none"]).default("none"),
});

// Parsed by diagnoseStepConfig before any model call; no secrets are included.
export const DiagnoseEnvSchema = z.object({
  MODEL_DIAGNOSE: z.string().min(1).default("muse-spark-1.3"),
  EFFORT_DIAGNOSE: z.enum(["minimal", "low", "medium", "high", "xhigh"]).default("high"),
  MAXTOK_DIAGNOSE: z.coerce.number().int().positive().default(32000),
});

export const SnapEnvSchema = z.object({
  MODEL_SNAP: z.string().min(1).default("muse-spark-1.3"),
  EFFORT_SNAP: z.enum(["minimal", "low", "medium", "high", "xhigh"]).default("minimal"),
  MAXTOK_SNAP: z.coerce.number().int().positive().max(500).default(400),
});

export const LadderEnvSchema = z.object({
  MODEL_LADDER: z.string().min(1).default("muse-spark-1.3"),
  EFFORT_LADDER: z.enum(["minimal", "low", "medium", "high", "xhigh"]).default("low"),
  MAXTOK_LADDER: z.coerce.number().int().positive().default(8000),
});

export const StressEnvSchema = z.object({
  MODEL_STRESS: z.string().min(1).default("muse-spark-1.3"),
  EFFORT_STRESS: z.enum(["minimal", "low", "medium", "high", "xhigh"]).default("medium"),
  MAXTOK_STRESS: z.coerce.number().int().positive().default(16000),
});

export const ExplainEnvSchema = z.object({
  MODEL_EXPLAIN: z.string().min(1).default("muse-spark-1.3"),
  EFFORT_EXPLAIN: z.enum(["minimal", "low", "medium", "high", "xhigh"]).default("medium"),
  MAXTOK_EXPLAIN: z.coerce.number().int().positive().default(16000),
});

export const MetaEnvSchema = z.object({
  MODEL_API_KEY: z.string().default(""),
  MODEL_API_BASE_URL: z.url().default("https://api.meta.ai/v1"),
  DAILY_BUDGET_USD: z.coerce.number().positive().default(10),
  PROMPT_CACHE_RETENTION: z.enum(["in_memory", "24h"]).default("24h"),
  DEMO_REPLAY: z.enum(["0", "1"]).default("0"),
  DEMO_RECORD: z.enum(["0", "1"]).default("0"),
  // Lifetime cap on live spend counted from BUDGET_SINCE (ISO date; empty = all recorded calls).
  TOTAL_BUDGET_USD: z.coerce.number().positive().default(143),
  BUDGET_SINCE: z.string().default(""),
});

export const LimitsEnvSchema = z.object({
  MAX_ATTEMPTS_PER_USER_PER_DAY: z.coerce.number().int().positive().default(10),
  IP_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(30),
  // Bearer token for /api/admin/stats; empty = the endpoint answers 404.
  ADMIN_TOKEN: z.string().default(""),
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
