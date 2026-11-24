import { expect, it } from "vitest";
import { headlineText, probeHeadline } from "@/src/domain/probe-headline";

it("states the sample result in both locales", () => {
  expect(probeHeadline("en", { kind: "clear", matched: true })).toBe(
    "Your code passed the official samples. Looking for a failing test.",
  );
  expect(probeHeadline("ar-EG", { kind: "clear", matched: true })).toMatch(/^[\u0600-\u06ff]/);
  expect(probeHeadline("en", { kind: "hit", status: "tle" })).toBe(
    "Your code ran out of time on an official sample.",
  );
  expect(probeHeadline("ar-EG", { kind: "hit", status: "tle" })).toMatch(/^[\u0600-\u06ff]/);
  expect(probeHeadline("en", { kind: "clear", matched: false })).toContain("different answer");
});

it("keeps the final diagnosis when it disagrees with the preview", () => {
  expect(
    headlineText("The loop looks risky.", "The loop never stops when the ribbon does not divide."),
  ).toBe("The loop never stops when the ribbon does not divide.");
  expect(headlineText("The loop looks risky.", "   ")).toBe("The loop looks risky.");
  expect(headlineText(undefined, undefined)).toBe("");
});
