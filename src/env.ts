import { z } from "zod";

// Parsed by diagnoseStepConfig before any model call; no secrets are included.
export const DiagnoseEnvSchema = z.object({
  MODEL_DIAGNOSE: z.string().min(1).default("muse-spark-1.3"),
  EFFORT_DIAGNOSE: z.enum(["minimal", "low", "medium", "high", "xhigh"]).default("high"),
  MAXTOK_DIAGNOSE: z.coerce.number().int().positive().default(16000),
});
