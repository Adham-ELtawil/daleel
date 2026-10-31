import { StressEnvSchema } from "@/src/env";
import { jsonSchemaFor, type ChatMessage, type LlmStepConfig } from "@/src/llm/meta-client";
import type { Diagnosis } from "../schemas/diagnosis";
import { StressPlanSchema } from "../schemas/stress";
import {
  SAFETY_AND_DATA,
  buildProblemBlock,
  buildAttemptBlock,
  taggedText,
  type AttemptBlock,
} from "./blocks";

const DEVELOPER_PROMPT = `You write test material for a stress test. You are given a competitive programming problem, a student's (probably wrong) program and an internal diagnosis.
Produce:
1. brute_cpp: a SIMPLE, OBVIOUSLY CORRECT C++17 program for the problem that reads stdin and writes stdout in the exact required format. Prefer brute force over cleverness; it only needs to be fast for SMALL inputs. Use long long where values can be large. No undefined behaviour. Only standard headers.
2. tests: up to 12 inputs, valid under the problem's constraints, in the exact input format (including the number of test cases line if the problem has one). Most tests must be SMALL so brute_cpp finishes in well under 1 second. Include the suspect inputs from the diagnosis, minimum-value cases, and up to 3 maximum-value cases ONLY if brute_cpp is fast enough for them.
3. checker: how to compare outputs: "exact_tokens" (default: compare whitespace-separated tokens, YES/NO case-insensitive) or "float_1e6" (absolute or relative error 1e-6) or "any_valid" (multiple answers allowed: then we cannot verify by comparison).
Do not copy the student's code into brute_cpp. Do not explain. Output JSON only.
{{SAFETY_AND_DATA}}`;

export function buildStressMessages({
  problem,
  attempt,
  diagnosis,
}: {
  problem: Parameters<typeof buildProblemBlock>[0];
  attempt: AttemptBlock;
  diagnosis: Diagnosis;
}): ChatMessage[] {
  return [
    {
      role: "developer",
      content: DEVELOPER_PROMPT.replace("{{SAFETY_AND_DATA}}", () => SAFETY_AND_DATA),
    },
    { role: "developer", content: buildProblemBlock(problem) },
    {
      role: "user",
      content: `${buildAttemptBlock(attempt)}\n<diagnosis_internal>${taggedText(diagnosis.root_cause_internal)} | suspects: ${taggedText(JSON.stringify(diagnosis.suspect_inputs))}</diagnosis_internal>`,
    },
  ];
}

export function stressStepConfig(env: Record<string, string | undefined>): LlmStepConfig {
  const parsed = StressEnvSchema.parse(env);
  return {
    step: "stress",
    model: parsed.MODEL_STRESS,
    reasoningEffort: parsed.EFFORT_STRESS,
    stream: true,
    maxCompletionTokens: parsed.MAXTOK_STRESS,
    schemaName: "StressPlan",
    schema: jsonSchemaFor(StressPlanSchema),
  };
}
