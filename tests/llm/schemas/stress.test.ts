import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { jsonSchemaFor } from "@/src/llm/meta-client";
import plan from "@/tests/fixtures/llm/stress-a.json";

async function schema() {
  expect(existsSync("src/llm/schemas/stress.ts"), "PR-16 StressPlan schema is missing").toBe(true);
  return (await import("@/src/llm/schemas/stress")).StressPlanSchema;
}
describe("StressPlanSchema", () => {
  it("generates exactly the strict JSON Schema in prompts §2.2", async () => {
    const doc = readFileSync("docs/04-PROMPTS.md", "utf8");
    const json = doc.split("### 2.2")[1].split("```json\n")[1].split("\n```")[0];
    expect(jsonSchemaFor(await schema())).toStrictEqual(JSON.parse(json));
  });
  it("accepts the documented Watermelon plan", async () => {
    expect((await schema()).parse(plan)).toEqual(plan);
  });
  it.each([
    { ...plan, brute_cpp: undefined },
    { ...plan, brute_complexity: null },
    { ...plan, checker: "unknown" },
    { ...plan, tests: [] },
    { ...plan, tests: Array.from({ length: 13 }, () => plan.tests[0]) },
    { ...plan, tests: [{ input: "2\n" }] },
    { ...plan, tests: [{ input: "2\n", purpose: "edge", extra: true }] },
    { ...plan, brute_cpp: "x".repeat(12001) },
    { ...plan, tests: [{ input: "x".repeat(4001), purpose: "edge" }] },
  ])("rejects missing keys, invalid bounds and unknown properties %#", async (broken) => {
    expect((await schema()).safeParse(broken).success).toBe(false);
  });
});
