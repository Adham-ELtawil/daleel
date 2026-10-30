import { LadderEnvSchema } from "@/src/env";
import { jsonSchemaFor, type ChatMessage, type LlmStepConfig } from "@/src/llm/meta-client";
import type { Diagnosis } from "../schemas/diagnosis";
import { HintLadderSchema } from "../schemas/ladder";
import {
  STYLE_AR,
  STYLE_EN,
  SAFETY_AND_DATA,
  buildProblemBlock,
  numberedCode,
  taggedText,
} from "./blocks";

const DEVELOPER_PROMPT = `You are Daleel, a patient competitive programming coach. Write a 4-step hint ladder for a student whose code is wrong. The student must be able to discover the fix themselves, so each level reveals a bit more:
- Level 1 "nudge": point to WHERE to look (a part of the code or a kind of input) and end with a short question back to the student. No code. Do not state the bug. Do not give the failing input.
- Level 2 "concept": name the missing observation or concept in general terms (for example "values can be as large as 10^9, so think about the size of the product"). No code. Do not give the exact fix.
- Level 3 "precise": say exactly which student line(s) are wrong and why, in words. If a verified failing input is provided, show it with the student's output and the expected output. No code blocks. Do not write the corrected code.
- Level 4 "full": explain the correct reasoning fully, why the student's version fails, and the minimal change to THEIR OWN lines described in words (the code diff is produced in a later step). Mention time complexity if relevant.
Each level: a short title (max 8 words) and a body of 1-4 short sentences (level 4 may use up to 8). Never write a complete solution. Never use fenced code blocks. Inline code in backticks is allowed only from level 3.
If the diagnosis is uncertain (uncertain = true), phrase levels 1-3 as checks the student can run ("try the smallest possible input") instead of claims.
If the bug is a compile error, level 1 quotes the first relevant compiler message line in backticks and explains it simply.
{{STYLE}}
{{SAFETY_AND_DATA}}`;

export function buildLadderMessages({
  problem,
  diagnosis,
  runnerResult,
  code,
  locale,
}: {
  problem: Parameters<typeof buildProblemBlock>[0];
  diagnosis: Diagnosis;
  runnerResult: { verified: true; input: string; expected: string; actual: string } | null;
  code: string;
  locale: "en" | "ar-EG";
}): ChatMessage[] {
  return [
    {
      role: "developer",
      content: DEVELOPER_PROMPT.replace("{{STYLE}}", () =>
        locale === "en" ? STYLE_EN : STYLE_AR,
      ).replace("{{SAFETY_AND_DATA}}", () => SAFETY_AND_DATA),
    },
    { role: "developer", content: buildProblemBlock(problem) },
    {
      role: "user",
      content: `<diagnosis>${taggedText(JSON.stringify(diagnosis))}</diagnosis>
<runner_result>${runnerResult ? taggedText(JSON.stringify(runnerResult)) : "not verified"}</runner_result>
uncertain: ${diagnosis.confidence < 0.4 && !runnerResult?.verified}
<student_code>
${numberedCode(code)}
</student_code>`,
    },
  ];
}

export function ladderStepConfig(env: Record<string, string | undefined>): LlmStepConfig {
  const parsed = LadderEnvSchema.parse(env);
  return {
    step: "ladder",
    model: parsed.MODEL_LADDER,
    reasoningEffort: parsed.EFFORT_LADDER,
    stream: false,
    maxCompletionTokens: parsed.MAXTOK_LADDER,
    schemaName: "HintLadder",
    schema: jsonSchemaFor(HintLadderSchema),
  };
}
