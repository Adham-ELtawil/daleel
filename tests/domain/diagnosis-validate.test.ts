import { expect, it } from "vitest";
import { validateDiagnosis } from "@/src/domain/diagnosis-validate";
import { DiagnosisSchema } from "@/src/llm/schemas/diagnosis";
import example from "@/tests/fixtures/llm/diagnosis-a.json";

it("drops reversed/out-of-bounds ranges, retaining valid ranges without mutating the diagnosis", () => {
  const diagnosis = DiagnosisSchema.parse({
    ...example,
    lines: [
      { start: 1, end: 3, role: "related" },
      { start: 3, end: 2, role: "bug" },
      { start: 2, end: 4, role: "bug" },
      { start: 4, end: 4, role: "bug" },
    ],
  });
  expect(validateDiagnosis(diagnosis, "a\r\nb\r\nc\r\n").lines).toEqual([diagnosis.lines[0]]);
  expect(diagnosis.lines).toHaveLength(4);
});
it("normalises known topics and marks unknown topics custom without changing them twice", () => {
  const diagnosis = DiagnosisSchema.parse({
    ...example,
    topics: [" Math ", "BINARY SEARCH", "Parity Trick"],
  });
  const result = validateDiagnosis(diagnosis, "code");
  expect(result.topics).toEqual(["math", "binary search", "custom:parity trick"]);
  expect(validateDiagnosis(result, "code")).toEqual(result);
});
