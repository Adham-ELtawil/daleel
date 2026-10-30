import { expect, it } from "vitest";
import { jsonSchemaFor } from "@/src/llm/meta-client";
import { HintLadderSchema } from "@/src/llm/schemas/ladder";
import schema from "@/tests/fixtures/llm/ladder-schema.json";
import exampleA from "@/tests/fixtures/llm/ladder-a.json";
import exampleB from "@/tests/fixtures/llm/ladder-b.json";

it("generates exactly prompts §3.2", () =>
  expect(jsonSchemaFor(HintLadderSchema)).toStrictEqual(schema));
it.each([exampleA, exampleB])("parses the documented ladder", (ladder) => {
  expect(HintLadderSchema.parse(ladder)).toEqual(ladder);
});
it.each([
  { levels: exampleA.levels.slice(0, 3) },
  { levels: exampleA.levels.map((level) => ({ ...level, kind: "solution" })) },
  {
    levels: exampleA.levels.map(({ level, kind, title, body_md }) => ({
      level,
      kind,
      title,
      body_md,
    })),
  },
  { ...exampleA, extra: "private" },
])("rejects malformed ladders", (ladder) =>
  expect(HintLadderSchema.safeParse(ladder).success).toBe(false),
);
