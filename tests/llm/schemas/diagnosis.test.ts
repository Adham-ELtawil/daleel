import { describe, expect, it } from "vitest";
import { jsonSchemaFor } from "@/src/llm/meta-client";
import { DiagnosisSchema, toPublic } from "@/src/llm/schemas/diagnosis";
import schema from "@/tests/fixtures/llm/diagnosis-schema.json";
import exampleA from "@/tests/fixtures/llm/diagnosis-a.json";
import exampleB from "@/tests/fixtures/llm/diagnosis-b.json";

describe("DiagnosisSchema", () => {
  it("generates exactly the strict schema in prompts §1.2", () => {
    expect(jsonSchemaFor(DiagnosisSchema)).toStrictEqual(schema);
  });
  it.each([exampleA, exampleB])("validates the documented $bug_class example", (example) => {
    expect(DiagnosisSchema.parse(example)).toEqual(example);
  });
  it.each([
    { ...exampleA, public_summary: undefined },
    { ...exampleA, bug_class: "unknown" },
    { ...exampleA, approach: { ...exampleA.approach, matches_student_note: undefined } },
    { ...exampleA, suspect_inputs: [{ input: "2", why: "minimum" }] },
    { ...exampleA, lines: [{ start: 1.5, end: 2, role: "bug" }] },
    { ...exampleA, approach: { ...exampleA.approach, extra: "untrusted" } },
  ])("rejects missing keys, invalid enums/ranges and extra properties %#", (broken) => {
    expect(DiagnosisSchema.safeParse(broken).success).toBe(false);
  });
  it("accepts explicit null values without making their keys optional", () => {
    const value = {
      ...exampleA,
      approach: { ...exampleA.approach, matches_student_note: null },
      suspect_inputs: [{ input: "2", expected_output: null, why: "uncertain" }],
    };
    expect(DiagnosisSchema.parse(value)).toEqual(value);
  });
  it("removes all three internal fields from the public diagnosis", () => {
    const result = toPublic(DiagnosisSchema.parse(exampleA));
    expect(Object.keys(result)).toEqual(
      Object.keys(exampleA).filter((key) => !key.endsWith("_internal")),
    );
    expect(result.public_summary).toBe(exampleA.public_summary);
  });
});
