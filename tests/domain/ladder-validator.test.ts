import { expect, it } from "vitest";
import { validateLadder, applyFallback } from "@/src/domain/ladder-validator";
import { HintLadderSchema } from "@/src/llm/schemas/ladder";
import example from "@/tests/fixtures/llm/ladder-a.json";
import diagnosis from "@/tests/fixtures/llm/diagnosis-a.json";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

const context = { fixInternal: diagnosis.fix_internal, failingInput: "2\n" };
const fresh = () => HintLadderSchema.parse(example);
it("accepts A.3 with the A.1 fix", () =>
  expect(validateLadder(fresh(), context)).toEqual({ ok: true, violations: [] }));
it.each([
  [2, "body_md", "```cpp\ncout << w;\n```", "code_fence"],
  [1, "title", diagnosis.fix_internal.replaceAll(" ", "  "), "fix_leak"],
  [1, "body_md", "Try `abcdefghijklm`", "long_inline_code"],
  [2, "question_back", "Try input 2", "failing_input"],
  [3, "question_back", diagnosis.fix_internal, "fix_leak"],
] as const)("rejects level %i %s spoilers", (level, field, text, rule) => {
  const ladder = fresh();
  ladder.levels[level - 1][field] = text;
  expect(validateLadder(ladder, context)).toMatchObject({
    ok: false,
    violations: expect.arrayContaining([{ level, rule }]),
  });
});
it.each(["order", "kind", "missing"])("checks ladder structure: %s", (mode) => {
  const ladder = fresh();
  if (mode === "order") ladder.levels.reverse();
  if (mode === "kind") ladder.levels[0].kind = "full";
  if (mode === "missing") ladder.levels.pop();
  expect(validateLadder(ladder, context).ok).toBe(false);
});
it("allows short spans and fix lines, ignores unverified input and permits level 4 code", () => {
  const ladder = fresh();
  ladder.levels[0].body_md = "`abcdefghijkl` 2 abcdefghijklmno";
  ladder.levels[3].body_md = "```cpp\n" + diagnosis.fix_internal + "\n```";
  expect(validateLadder(ladder, { fixInternal: "abcdefghijklmno", failingInput: null }).ok).toBe(
    true,
  );
});
it.each(["en", "ar-EG"] as const)("replaces only offending levels in %s", (locale) => {
  const ladder = fresh();
  ladder.levels[1].body_md = "```spoiler```";
  const result = applyFallback(ladder, validateLadder(ladder, context).violations, locale);
  const copy = (locale === "en" ? en : ar).ladder_fallback_2;
  expect(result.levels[1]).toEqual({
    level: 2,
    kind: "concept",
    title: copy.title,
    body_md: copy.body,
    question_back: null,
  });
  for (const index of [0, 2, 3]) expect(result.levels[index]).toEqual(ladder.levels[index]);
  expect(ladder.levels[1].body_md).toBe("```spoiler```");
  expect(validateLadder(result, context).ok).toBe(true);
});
