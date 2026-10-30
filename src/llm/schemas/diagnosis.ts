import { z } from "zod";

// multipleOf(1) validates integers without Zod's implicit safe-integer maximum.
// jsonSchemaFor expresses the equivalent JSON Schema integer type.
const lineNumber = z.number().multipleOf(1).min(1);
export const DiagnosisSchema = z.strictObject({
  bug_found: z.boolean(),
  bug_class: z.enum([
    "edge_case",
    "overflow",
    "off_by_one",
    "wrong_algorithm",
    "wrong_greedy",
    "time_complexity",
    "memory",
    "output_format",
    "uninitialized_or_reset",
    "input_parsing",
    "precision",
    "compile_error",
    "runtime_error",
    "other",
    "none",
  ]),
  confidence: z.number().min(0).max(1),
  public_summary: z.string().max(240),
  lines: z
    .array(
      z.strictObject({
        start: lineNumber,
        end: lineNumber,
        role: z.enum(["bug", "related", "fine_but_suspicious"]),
      }),
    )
    .max(6),
  topics: z.array(z.string()).min(1).max(4),
  approach: z.strictObject({
    student_idea_public: z.string().max(300),
    correct_idea_family: z.string().max(120),
    is_approach_correct: z.boolean(),
    matches_student_note: z.boolean().nullable(),
  }),
  suspect_inputs: z
    .array(
      z.strictObject({
        input: z.string().max(2000),
        expected_output: z.string().max(2000).nullable(),
        why: z.string().max(200),
      }),
    )
    .max(5),
  complexity: z.strictObject({ student: z.string().max(60), required: z.string().max(60) }),
  root_cause_internal: z.string().max(1200),
  fix_internal: z.string().max(1200),
  checked_internal: z.string().max(800),
});

export type Diagnosis = z.infer<typeof DiagnosisSchema>;
export type DiagnosisPublic = Omit<
  Diagnosis,
  "root_cause_internal" | "fix_internal" | "checked_internal"
>;

export function toPublic(diagnosis: Diagnosis): DiagnosisPublic {
  return {
    bug_found: diagnosis.bug_found,
    bug_class: diagnosis.bug_class,
    confidence: diagnosis.confidence,
    public_summary: diagnosis.public_summary,
    lines: diagnosis.lines,
    topics: diagnosis.topics,
    approach: diagnosis.approach,
    suspect_inputs: diagnosis.suspect_inputs,
    complexity: diagnosis.complexity,
  };
}
