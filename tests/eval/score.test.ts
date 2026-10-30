import { expect, it } from "vitest";
import { ExpectedSchema, scoreCase, summarize } from "@/src/eval/score";
import { DiagnosisSchema } from "@/src/llm/schemas/diagnosis";
import example from "@/tests/fixtures/llm/diagnosis-a.json";
import cases from "@/tests/fixtures/llm/eval-score-cases.json";

it.each(cases)("scores $id", ({ expected, diagnosis, score }) => {
  const output = DiagnosisSchema.parse({ ...example, ...diagnosis });
  expect(scoreCase(ExpectedSchema.parse(expected), output)).toEqual(score);
});
it("totals scores and leaves runner verification n/a, including an empty run", () => {
  expect(summarize([])).toMatchObject({ cases: 0, score: 0, counterexample: "n/a" });
  const totals = summarize(cases.slice(0, 2).map((c) => c.score));
  expect(totals).toEqual({
    cases: 2,
    classOk: 1,
    lineOverlap: 2,
    mentions: 4,
    score: 3,
    counterexample: "n/a",
  });
});
