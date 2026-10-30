import { existsSync, readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";
import { codeLines } from "@/src/domain/code-lines";
import { ExpectedSchema } from "@/src/eval/score";
import { parseCodeforcesHtml } from "@/src/judges/codeforces";
import { parseAtcoderHtml } from "@/src/judges/atcoder";
import cases from "@/tests/fixtures/eval-sources.json";

it("has exactly the ten seed cases", () => {
  expect(cases).toHaveLength(10);
  expect(existsSync("tests/fixtures/eval")).toBe(true);
  expect(readdirSync("tests/fixtures/eval").sort()).toEqual(cases.map((c) => c.id).sort());
});
it.each(cases)("validates $id from saved HTML", ({ id, source, bug_class }) => {
  const dir = `tests/fixtures/eval/${id}`;
  for (const name of ["problem.json", "code.cpp", "expected.json"])
    expect(existsSync(`${dir}/${name}`)).toBe(true);
  const count = codeLines(readFileSync(`${dir}/code.cpp`, "utf8")).length;
  const expected = ExpectedSchema.parse(JSON.parse(readFileSync(`${dir}/expected.json`, "utf8")));
  expect(expected.lines.every((line) => line <= count)).toBe(true);
  expect(expected.bug_class).toBe(bug_class);
  const html = readFileSync(`tests/fixtures/${source}.html`, "utf8");
  const parsed = id.startsWith("cf-") ? parseCodeforcesHtml(html) : parseAtcoderHtml(html);
  expect(parsed.statementMd.trim()).not.toBe("");
  expect(parsed.samples.length).toBeGreaterThan(0);
  for (const sample of parsed.samples) {
    expect(sample.input.trim()).not.toBe("");
    expect(sample.output.trim()).not.toBe("");
  }
  expect(JSON.parse(readFileSync(`${dir}/problem.json`, "utf8"))).toMatchObject(parsed);
});
