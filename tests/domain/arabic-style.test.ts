import { expect, it } from "vitest";

it.each([
  ["overflow هنا", "الـ overflow هنا"],
  ["`a[i]` هنا", "الـ `a[i]` هنا"],
  ["راجع الـ input\n  edge case هنا\n\n`n` كبير", "راجع الـ input\n  الـ edge case هنا\n\nالـ `n` كبير"],
  ["راجع الكود\n٢ قيم\n", "راجع الكود\n٢ قيم\n"],
  ["", ""],
])("fixes Latin/backtick line starts cheaply: %s", async (text, expected) => {
  const { fixArabicPublicText } = await import("@/src/domain/arabic-style");
  const fixed = fixArabicPublicText(text);
  expect(fixed).toBe(expected);
  expect(fixArabicPublicText(fixed)).toBe(fixed);
});
