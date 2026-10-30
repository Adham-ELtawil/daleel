import { RunnerEnvSchema } from "@/src/env";
import { createLocalRunner } from "./local";
import { createNoneRunner } from "./none";
import type { Runner } from "./runner";

export function createRunner(env: Record<string, string | undefined>): Runner {
  return RunnerEnvSchema.parse(env).RUNNER_PROVIDER === "local"
    ? createLocalRunner()
    : createNoneRunner();
}
export function runnerHealth(env: Record<string, string | undefined>): "ok" | "off" | "down" {
  try {
    return createRunner(env).name === "none" ? "off" : "ok";
  } catch {
    return "down";
  }
}
