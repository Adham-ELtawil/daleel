import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import * as prompts from "@/src/llm/prompts/ladder";
import { buildProblemBlock, STYLE_AR_LADDER, STYLE_EN } from "@/src/llm/prompts/blocks";
import problems from "@/src/db/seed-fixtures/problems.json";

const problem = { ...problems[0], judge: "codeforces" as const };
it.each(["en", "ar-EG"] as const)(
  "builds a statement-only idea ladder in the documented message order in %s",
  (locale) => {
    expect(prompts).toHaveProperty("buildIdeaLadderMessages");
    const messages = prompts.buildIdeaLadderMessages({ problem, locale });
    expect(messages.map(({ role }) => role)).toEqual(["developer", "developer", "user"]);
    expect(messages[1].content).toBe(buildProblemBlock(problem));
    expect(messages[0].content).toContain(locale === "en" ? STYLE_EN : STYLE_AR_LADDER);
    expect(messages[0].content).toContain('Level 1 "nudge"');
    expect(messages[0].content).toContain('Level 3 "precise"');
    expect(messages[0].content).toContain("question_back is required");
    expect(messages[0].content).toContain("Never write code or pseudo-code");
    expect(messages[0].content).toContain("time complexity");
    expect(messages[0].content).toContain("final formula");
    expect(messages[2].content.length).toBeLessThan(120);
    expect(JSON.stringify(messages)).not.toMatch(/<student_code>|<diagnosis>/);
    const doc = readFileSync("docs/04-PROMPTS.md", "utf8");
    expect(doc).toContain("### 3.4 Idea ladder");
    const block = doc.split("### 3.4 Idea ladder")[1].split("```text\n")[1].split("\n```")[0];
    expect(messages[0].content).toBe(
      block.replace("{{STYLE}}", locale === "en" ? STYLE_EN : STYLE_AR_LADDER),
    );
  },
);
