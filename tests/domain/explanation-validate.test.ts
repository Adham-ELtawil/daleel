import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import example from "@/tests/fixtures/llm/explanation-a.json";

async function validator() {
  const path = resolve("src/domain/explanation-validate.ts");
  expect(existsSync(path), "Explanation validation behavior is missing").toBe(true);
  return (await import(path)) as typeof import("@/src/domain/explanation-validate");
}
const code = readFileSync("docs/examples/cf-4A-watermelon/student.cpp", "utf8");
it("overwrites predicted outputs with exact verified runner truth without mutating the model response", async () => {
  const { validateExplanation } = await validator();
  const stress = {
    status: "verified" as const,
    expectedOutput: "runner expected\n",
    actualOutput: "runner actual\n",
  };
  const result = validateExplanation(example, code, stress);
  expect(result.trace).toMatchObject({
    expected_output: stress.expectedOutput,
    student_output: stress.actualOutput,
  });
  expect(example.trace.student_output).toBe("YES");
  expect(validateExplanation(example, code, { ...stress, status: "error" }).trace).toEqual(
    example.trace,
  );
});
it("drops nonexistent and mismatched fix lines, handles CRLF and clamps frames to 40", async () => {
  const raw = {
    ...example,
    fix: [
      ...example.fix,
      { line: 99, old: "absent", new: "bad" },
      { line: 5, old: "mismatch", new: "bad" },
    ],
    trace: { ...example.trace, frames: Array.from({ length: 45 }, () => example.trace.frames[0]) },
  };
  const result = (await validator()).validateExplanation(raw, code.replace(/\n/g, "\r\n"), null);
  expect(result.fix).toEqual(example.fix);
  expect(result.trace.frames).toHaveLength(40);
  expect(raw.trace.frames).toHaveLength(45);
});
