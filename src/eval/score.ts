import { z } from "zod";
import { DiagnosisSchema, type Diagnosis } from "@/src/llm/schemas/diagnosis";

const keyword = z.string().regex(/^[a-z0-9]+$/);
export const ExpectedSchema = z.strictObject({
  bug_class: DiagnosisSchema.shape.bug_class,
  lines: z.array(z.number().int().positive()).min(1),
  must_mention: z.array(keyword).min(1).max(3),
});

export function scoreCase(expected: z.infer<typeof ExpectedSchema>, diagnosis: Diagnosis) {
  const classOk = expected.bug_class === diagnosis.bug_class;
  const lineOverlap = diagnosis.lines.some(({ start, end }) =>
    expected.lines.some((line) => start <= line && line <= end),
  );
  const text = `${diagnosis.public_summary} ${diagnosis.root_cause_internal}`.toLowerCase();
  const mentions = expected.must_mention.filter((word) => text.includes(word.toLowerCase())).length;
  // §9: class + overlap, out of two until runner verification exists. Mentions are diagnostic only.
  return { classOk, lineOverlap, mentions, score: Number(classOk) + Number(lineOverlap) };
}

export function summarize(results: ReturnType<typeof scoreCase>[]) {
  return results.reduce(
    (totals, result) => ({
      cases: totals.cases + 1,
      classOk: totals.classOk + Number(result.classOk),
      lineOverlap: totals.lineOverlap + Number(result.lineOverlap),
      mentions: totals.mentions + result.mentions,
      score: totals.score + result.score,
      counterexample: "n/a",
    }),
    { cases: 0, classOk: 0, lineOverlap: 0, mentions: 0, score: 0, counterexample: "n/a" },
  );
}
