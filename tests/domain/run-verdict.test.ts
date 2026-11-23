import { expect, it } from "vitest";
import { previewSummary, runVerdict, streamedBugFound } from "@/src/domain/run-verdict";

it.each([
  ["ok", "wa"],
  ["tle", "tle"],
  ["mle", "mle"],
  ["re", "re"],
  ["ole", "ole"],
] as const)("maps runner status %s to %s", (status, verdict) => {
  expect(runVerdict(status)).toBe(verdict);
});

it("reads a closed public summary and ignores an unfinished string", () => {
  expect(previewSummary('{"bug_found":true,"public_summary":"The loop never stops."}')).toBe(
    "The loop never stops.",
  );
  expect(previewSummary('{"public_summary":"The loop ')).toBeNull();
  expect(previewSummary('{"public_summary":"say \\"hi\\"."}')).toBe('say "hi".');
});

it("reads bug_found only after the boolean is complete", () => {
  expect(streamedBugFound('{"bug_found":true,"bug_class"')).toBe(true);
  expect(streamedBugFound('{"bug_found":false}')).toBe(false);
  expect(streamedBugFound('{"bug_found":')).toBeNull();
});
