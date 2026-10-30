import { expect, it } from "vitest";
import fixture from "@/tests/fixtures/llm/ladder-a.json";

it("appends reveals without losing previous cards, duplicates or input mutation", async () => {
  const { appendHint, nextHintLevel } = await import("@/src/domain/attempt-ui");
  const original = [fixture.levels[0]];
  const hints = appendHint(original, fixture.levels[1]);
  expect(original).toHaveLength(1);
  expect(hints.map((hint) => hint.level)).toEqual([1, 2]);
  expect(appendHint(hints, fixture.levels[1])).toEqual(hints);
  expect(appendHint([fixture.levels[1]], fixture.levels[0])).toEqual(hints);
  expect(nextHintLevel(hints)).toBe(3);
});
it("starts at Hint 1, resumes persisted reveals, and hides the button after Hint 4", async () => {
  const { nextHintLevel } = await import("@/src/domain/attempt-ui");
  for (let count = 0; count <= 4; count++) {
    expect(nextHintLevel(fixture.levels.slice(0, count))).toBe(count === 4 ? null : count + 1);
  }
});
it.each([
  ["1", "new", false, true],
  [undefined, "new", false, false],
  ["0", "new", false, false],
  ["true", "new", false, false],
  [["1", "1"], "new", false, false],
  ["1", "diagnosed", true, false],
  ["1", "new", true, false],
  ["1", "diagnosing", false, false],
  ["1", "solved", false, false],
])("autostart=%j status=%s diagnosis=%s yields %s", async (value, status, diagnosed, expected) => {
  const { shouldAutostart } = await import("@/src/domain/attempt-ui");
  expect(shouldAutostart(value, status, diagnosed)).toBe(expected);
});
it.each([
  ["2026-01-01T22:30:00Z", "Jan 2, 2026", "12:30 AM"],
  ["2026-07-01T21:30:00Z", "Jul 2, 2026", "12:30 AM"],
])("formats %s in Cairo across midnight and seasonal offsets", async (utc, date, time) => {
  const { formatAttemptDate } = await import("@/src/domain/attempt-ui");
  const result = formatAttemptDate(Date.parse(utc), "en");
  expect(result).toContain(date);
  expect(result).toContain(time);
});
it("localizes the Cairo date in Arabic", async () => {
  const { formatAttemptDate } = await import("@/src/domain/attempt-ui");
  const result = formatAttemptDate(Date.parse("2026-07-01T21:30:00Z"), "ar-EG");
  expect(result).toContain("يوليو");
  expect(result).toContain("٢");
});
