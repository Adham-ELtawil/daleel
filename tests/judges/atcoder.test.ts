import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAtcoderHtml } from "@/src/judges/atcoder";

const fixture = (id: string) => readFileSync(`tests/fixtures/judges/atcoder-${id}.html`, "utf8");

describe("parseAtcoderHtml", () => {
  it.each([
    {
      id: "abc300_a",
      title: "A - N-choice question",
      phrase: "Given integers",
      samples: [
        { input: "3 125 175\n200 300 400\n", output: "2\n" },
        { input: "1 1 1\n2\n", output: "1\n" },
        { input: "5 123 456\n135 246 357 468 579\n", output: "5\n" },
      ],
      notes: "The problem may be a one-choice problem.",
    },
    {
      id: "abc300_b",
      title: "B - Same Map in the RPG World",
      phrase: "We have grids",
      samples: [
        { input: "4 3\n..#\n...\n.#.\n...\n#..\n...\n.#.\n...\n", output: "Yes\n" },
        { input: "3 2\n##\n##\n#.\n..\n#.\n#.\n", output: "No\n" },
        { input: "4 5\n#####\n.#...\n.##..\n..##.\n...##\n#...#\n#####\n...#.\n", output: "Yes\n" },
        {
          input:
            "10 30\n..........##########..........\n..........####....###.....##..\n.....##....##......##...#####.\n....####...##..#####...##...##\n...##..##..##......##..##....#\n#.##....##....##...##..##.....\n..##....##.##..#####...##...##\n..###..###..............##.##.\n.#..####..#..............###..\n#..........##.................\n................#..........##.\n######....................####\n....###.....##............####\n.....##...#####......##....##.\n.#####...##...##....####...##.\n.....##..##....#...##..##..##.\n##...##..##.....#.##....##....\n.#####...##...##..##....##.##.\n..........##.##...###..###....\n...........###...#..####..#...\n",
          output: "Yes\n",
        },
      ],
      notes: "No choice of",
    },
  ])("extracts only English fields from $id", ({ id, title, phrase, samples, notes }) => {
    const problem = parseAtcoderHtml(fixture(id));
    expect(problem.title).toBe(title);
    expect(problem.timeLimitMs).toBe(2000);
    expect(problem.memoryLimitMb).toBe(1024);
    expect(problem.samples).toHaveLength(samples.length);
    expect(problem.samples).toEqual(samples);
    expect(problem.statementMd).toContain(phrase);
    expect(problem.statementMd).toContain("Constraints");
    expect(problem.statementMd).not.toMatch(/問題文|Score :/);
    expect(problem.inputSpecMd).toContain("Standard Input");
    expect(problem.outputSpecMd).toContain("Print");
    expect(problem.notesMd).toContain(notes);
  });

  it("preserves TeX and strips the Problem title prefix", () => {
    const problem = parseAtcoderHtml(
      fixture("abc300_a").replace("<title>A -", "<title>Problem - A -"),
    );
    expect(problem.title).toBe("A - N-choice question");
    expect(problem.inputSpecMd).toContain(String.raw`\dots`);
    expect(problem.statementMd).toContain(String.raw`1 \le N \le 300`);
  });

  it("rejects a missing English section or unpaired sample", () => {
    expect(() =>
      parseAtcoderHtml(fixture("abc300_a").replace('class="lang-en"', 'class="missing"')),
    ).toThrow();
    expect(() =>
      parseAtcoderHtml(fixture("abc300_a").replaceAll("Sample Output 3", "Missing Output 3")),
    ).toThrow();
  });
});
