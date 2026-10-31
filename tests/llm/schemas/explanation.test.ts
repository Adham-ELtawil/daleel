import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { jsonSchemaFor } from "@/src/llm/meta-client";
import schema from "@/tests/fixtures/llm/explanation-schema.json";
import exampleA from "@/tests/fixtures/llm/explanation-a.json";
import exampleB from "@/tests/fixtures/llm/explanation-b.json";

async function schemas() {
  const path = resolve("src/llm/schemas/explanation.ts");
  expect(existsSync(path), "Explanation schema behavior is missing").toBe(true);
  return (await import(path)) as typeof import("@/src/llm/schemas/explanation");
}
it("generates exactly prompts §4.2", async () => {
  expect(jsonSchemaFor((await schemas()).ExplanationSchema)).toStrictEqual(schema);
});
it.each([exampleA, exampleB])("parses documented explanation and trace", async (value) => {
  expect((await schemas()).ExplanationSchema.parse(value)).toEqual(value);
});
it("requires nullable fields, closed objects and at most 40 frames", async () => {
  const { ExplanationSchema } = await schemas();
  expect(
    ExplanationSchema.parse({ ...exampleA, complexity_note: null }).complexity_note,
  ).toBeNull();
  const { explanation_md, fix, trace } = exampleA;
  for (const value of [
    { explanation_md, fix, trace },
    { ...exampleA, extra: "private" },
    { ...exampleA, trace: { ...trace, frames: [] } },
    { ...exampleA, trace: { ...trace, frames: Array(41).fill(trace.frames[0]) } },
    {
      ...exampleA,
      trace: { ...trace, frames: [{ caption: "missing fields", arrays: [], vars: [] }] },
    },
  ])
    expect(ExplanationSchema.safeParse(value).success).toBe(false);
});
