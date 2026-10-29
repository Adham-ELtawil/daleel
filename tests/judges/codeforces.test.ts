import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCodeforcesHtml } from "@/src/judges/codeforces";

const fixture = (id: string) => readFileSync(`tests/fixtures/judges/cf-${id}.html`, "utf8");

describe("parseCodeforcesHtml", () => {
  it.each([
    {
      id: "4A",
      title: "Watermelon",
      memory: 64,
      phrase: "positive weight",
      samples: [{ input: "8\n", output: "YES\n" }],
      notes: "2 and 6 kilos",
    },
    {
      id: "1A",
      title: "Theatre Square",
      memory: 256,
      phrase: "square granite flagstones",
      samples: [{ input: "6 6 4\n", output: "4\n" }],
      notes: null,
    },
    {
      id: "1352C",
      title: "K-th Not Divisible by n",
      memory: 256,
      phrase: "two positive integers",
      samples: [
        {
          input: "6\n3 7\n4 12\n2 1000000000\n7 97\n1000000000 1000000000\n2 1\n",
          output: "10\n15\n1999999999\n113\n1000000001\n1\n",
        },
      ],
      notes: null,
    },
  ])("extracts all problem fields from $id", ({ id, title, memory, phrase, samples, notes }) => {
    const problem = parseCodeforcesHtml(fixture(id));
    expect(problem.title).toBe(title);
    expect(problem.timeLimitMs).toBe(1000);
    expect(problem.memoryLimitMb).toBe(memory);
    expect(problem.samples).toHaveLength(samples.length);
    expect(problem.samples).toEqual(samples);
    expect(problem.statementMd).toContain(phrase);
    expect(problem.statementMd).not.toContain("time limit per test");
    expect(problem.inputSpecMd).toContain("integer");
    expect(problem.outputSpecMd).toMatch(/print|write/i);
    if (notes) expect(problem.notesMd).toContain(notes);
    else expect(problem.notesMd).toBeNull();
  });

  it("preserves TeX and normalises CF math delimiters", () => {
    const problem = parseCodeforcesHtml(fixture("1352C"));
    expect(problem.statementMd).toContain("$n$");
    expect(problem.statementMd).toContain(String.raw`$1, 2, 4, 5, 7, 8, 10, 11, 13 \dots$`);
    expect(problem.inputSpecMd).toContain(String.raw`$2 \le n \le 10^9$`);
    expect(problem.statementMd).not.toContain("$$$");
    expect(parseCodeforcesHtml(fixture("1A")).inputSpecMd).toContain("10^{9}");
  });

  it("handles test-example-line samples without losing spaces or blank lines", () => {
    const html = fixture("4A").replace(
      "8<br />",
      '<div class="test-example-line"> 8  2 </div><div class="test-example-line"></div><div class="test-example-line">&lt;9&gt;</div>',
    );
    expect(parseCodeforcesHtml(html).samples[0]).toEqual({
      input: " 8  2 \n\n<9>\n",
      output: "YES\n",
    });
  });

  it("rejects pages without a problem or paired samples", () => {
    expect(() => parseCodeforcesHtml("<html>Forbidden</html>")).toThrow();
    expect(() =>
      parseCodeforcesHtml(fixture("4A").replace('class="output"', 'class="missing"')),
    ).toThrow();
  });
});
