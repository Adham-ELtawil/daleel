import { expect, it } from "vitest";
import { splitMath } from "@/src/lib/math";

it.each([
  ["$$$x$$$", "x", false],
  ["$$$$$$x^2$$$$$$", "x^2", true],
  ["$$\\frac{a}{b}$$", "\\frac{a}{b}", true],
  ["$\\texttt{six}$", "\\texttt{six}", false],
  ["$1 \\le n, m \\le 100$", "1 \\le n, m \\le 100", false],
] as const)("splits the math delimiters in %s", (text, value, display) => {
  expect(splitMath(text)).toEqual([{ kind: "math", value, display }]);
});

it("preserves Arabic text around isolated inline math", () => {
  expect(splitMath("لو $n \\le 10^5$ يبقى")).toEqual([
    { kind: "text", value: "لو " },
    { kind: "math", value: "n \\le 10^5", display: false },
    { kind: "text", value: " يبقى" },
  ]);
});

it.each([
  "costs $5",
  "a $ b",
  "$5 and $10",
  "costs $5 and $10",
  "$ x$",
  "$x $",
  "$x$2",
  "$a\n\nb$",
  "$a\r\n \r\nb$",
  "$$",
  "$$$x$$",
])("keeps unmatched or invalid delimiters literal: %s", (text) => {
  expect(splitMath(text)).toEqual([{ kind: "text", value: text }]);
});

it("unescapes literal dollars and merges adjacent text", () => {
  expect(splitMath("costs \\$5 and \\$10")).toEqual([{ kind: "text", value: "costs $5 and $10" }]);
  expect(splitMath("\\$")).toEqual([{ kind: "text", value: "$" }]);
  expect(splitMath("")).toEqual([]);
});

it("keeps escaped dollars inside TeX and preserves plain-text newlines", () => {
  expect(splitMath("before\n$x + \\$5$\nafter")).toEqual([
    { kind: "text", value: "before\n" },
    { kind: "math", value: "x + \\$5", display: false },
    { kind: "text", value: "\nafter" },
  ]);
});

it("allows a single newline in inline math and multiple lines in display math", () => {
  expect(splitMath("$a\nb$")).toEqual([{ kind: "math", value: "a\nb", display: false }]);
  expect(splitMath("$$a\n\nb$$")).toEqual([{ kind: "math", value: "a\n\nb", display: true }]);
});

it("splits consecutive expressions without empty text parts", () => {
  expect(splitMath("$a$$b$")).toEqual([
    { kind: "math", value: "a", display: false },
    { kind: "math", value: "b", display: false },
  ]);
});
