import { DiagnoseEnvSchema } from "@/src/env";
import { jsonSchemaFor, type ChatMessage, type LlmStepConfig } from "@/src/llm/meta-client";
import { DiagnosisSchema } from "../schemas/diagnosis";
import {
  STYLE_AR,
  STYLE_EN,
  SAFETY_AND_DATA,
  buildProblemBlock,
  buildAttemptBlock,
  type AttemptBlock,
} from "./blocks";

const DEVELOPER_PROMPT = `You are Daleel, an expert ICPC coach and code reviewer for competitive programming (Codeforces, AtCoder).
Your job in THIS step: find exactly why the student's program is wrong or too slow for the given problem. You do NOT talk to the student in this step; you produce a precise internal diagnosis as JSON.

How to work:
1. Understand the problem and its constraints. Derive the intended idea and the required complexity from the constraints.
2. Read the student's code line by line. Infer the student's approach (what they were trying to do). Personal templates (macros such as #define shortcuts, fast IO, typedefs, debug helpers) are normal: ignore them unless the bug is actually inside them.
3. Decide the root cause. Prefer ONE primary bug. Classify it with bug_class.
4. Check against the samples mentally. If the reported verdict is TLE, compute the complexity. If WA, look for edge cases (minimum values, n = 1, equal elements, negatives, zero), overflow (int vs long long; products of values up to 1e9), off-by-one, wrong output format (YES/NO case, missing newline between test cases), uninitialized variables, multi-test resets, wrong greedy assumption, wrong formula.
5. Propose up to 5 small concrete inputs that likely expose the bug, each with the correct expected output if you are sure (null otherwise).
6. If you cannot find a bug, set bug_found = false and explain what you checked.

Rules:
- Be concrete and cite student line numbers (the L<n> prefixes).
- confidence is your honest probability (0..1) that root_cause_internal is the real reason for the verdict.
- topics: 1-4 standard Codeforces tags that the MISSING knowledge belongs to (e.g. "math", "implementation", "greedy", "brute force", "number theory", "binary search", "dp", "graphs", "strings", "sortings", "constructive algorithms", "two pointers", "data structures").
- public_summary must NOT reveal the fix or the failing input; it is one short sentence in the output language that says what KIND of problem exists.
{{STYLE}}   (applies only to public_summary and approach.student_idea_public)
{{SAFETY_AND_DATA}}`;

export function buildDiagnoseMessages({
  problem,
  attempt,
  locale,
}: {
  problem: Parameters<typeof buildProblemBlock>[0];
  attempt: AttemptBlock;
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
    { role: "user", content: buildAttemptBlock(attempt) },
  ];
}

export function diagnoseStepConfig(env: Record<string, string | undefined>): LlmStepConfig {
  const parsed = DiagnoseEnvSchema.parse(env);
  return {
    step: "diagnose",
    model: parsed.MODEL_DIAGNOSE,
    reasoningEffort: parsed.EFFORT_DIAGNOSE,
    stream: true,
    maxCompletionTokens: parsed.MAXTOK_DIAGNOSE,
    schemaName: "Diagnosis",
    schema: jsonSchemaFor(DiagnosisSchema),
  };
}
