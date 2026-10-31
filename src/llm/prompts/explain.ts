import { ExplainEnvSchema } from "@/src/env";
import { jsonSchemaFor, type ChatMessage, type LlmStepConfig } from "@/src/llm/meta-client";
import type { Diagnosis } from "../schemas/diagnosis";
import { ExplanationSchema } from "../schemas/explanation";
import * as blocks from "./blocks";

const DEVELOPER_PROMPT = `The student is stuck and asked for the full explanation and an animated walkthrough.
Produce:
1. explanation_md: a clear explanation (max ~250 words): the key observation, why the student's code fails on the given input, and the correct reasoning. No complete solution.
2. fix: a minimal edit to the student's OWN code, as a list of line replacements (line numbers refer to the student's numbered code). Change as few lines as possible. Do not rewrite the program.
3. trace: a step-by-step execution of the STUDENT'S program on the given small input, to be animated. Each frame shows the state after executing one meaningful step: arrays (as lists of string values with highlighted indices and named pointers), scalar variables (mark changed=true when the value changed in this frame), the current student line number, and a one-sentence caption. Use at most 30 frames; skip boring repetitions with one caption like "the loop repeats for i = 3..9". The final frame must show the student's output vs the expected output.
Keep arrays at most 16 cells (truncate with "…").
{{STYLE}}   (applies to explanation_md and captions; variable names stay as in the code)
{{SAFETY_AND_DATA}}`;

export function buildExplainMessages(context: {
  problem: Parameters<typeof blocks.buildProblemBlock>[0];
  attempt: blocks.AttemptBlock;
  diagnosis: Diagnosis;
  stress: { status: string; failingInput: string | null; expectedOutput: string | null } | null;
  locale: "en" | "ar-EG";
}): ChatMessage[] {
  const { problem, attempt, diagnosis, stress, locale } = context;
  const verified = stress?.status === "verified" ? stress : null;
  const suspect = diagnosis.suspect_inputs[0],
    sample = problem.samples[0];
  const input = verified?.failingInput ?? suspect?.input ?? sample?.input ?? "";
  const expected = verified?.expectedOutput ?? suspect?.expected_output ?? sample?.output ?? "";
  return [
    {
      role: "developer",
      content: DEVELOPER_PROMPT.replace("{{STYLE}}", () =>
        locale === "en" ? blocks.STYLE_EN : blocks.STYLE_AR_LADDER,
      ).replace("{{SAFETY_AND_DATA}}", () => blocks.SAFETY_AND_DATA),
    },
    { role: "developer", content: blocks.buildProblemBlock(problem) },
    {
      role: "user",
      content: `${blocks.buildAttemptBlock(attempt)}
<diagnosis_internal>${blocks.taggedText(JSON.stringify(diagnosis))}</diagnosis_internal>
<trace_input>${blocks.taggedText(input)}</trace_input>
<expected_output>${blocks.taggedText(expected)}</expected_output>`,
    },
  ];
}
export function explainStepConfig(env: Record<string, string | undefined>): LlmStepConfig {
  const parsed = ExplainEnvSchema.parse(env);
  return {
    step: "explain",
    model: parsed.MODEL_EXPLAIN,
    reasoningEffort: parsed.EFFORT_EXPLAIN,
    stream: true,
    maxCompletionTokens: parsed.MAXTOK_EXPLAIN,
    schemaName: "Explanation",
    schema: jsonSchemaFor(ExplanationSchema),
  };
}
