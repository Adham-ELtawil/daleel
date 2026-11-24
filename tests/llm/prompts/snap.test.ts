import { expect, it } from "vitest";
import { costUsd } from "@/src/llm/pricing";
import { buildSnapMessages, snapStepConfig } from "@/src/llm/prompts/snap";

it("keeps a capped snap call under half a cent on muse-spark-1.3", () => {
  const messages = buildSnapMessages({
    locale: "ar-EG",
    problem: {
      title: "Cut Ribbon".repeat(40),
      statementMd: "Ribbon ".repeat(4000),
      inputSpecMd: "Four integers ".repeat(400),
      outputSpecMd: "One integer ".repeat(400),
      samples: [{ input: "11 4 6 5\n".repeat(200), output: "2\n".repeat(100) }],
    },
    attempt: {
      code: Array.from({ length: 300 }, (_, n) => `int line${n} = ${"9".repeat(80)};`).join("\n"),
      language: "cpp17",
      verdictReported: "WA",
      verdictTestNo: 3,
      studentNote: "idea ".repeat(200),
    },
  });
  const promptTokens = Math.ceil(Buffer.byteLength(JSON.stringify(messages), "utf8") / 4);
  const cap = snapStepConfig({}).maxCompletionTokens;
  expect(snapStepConfig({}).reasoningEffort).toBe("minimal");
  expect(cap).toBeLessThanOrEqual(500);
  const worst = costUsd("muse-spark-1.3", {
    promptTokens,
    completionTokens: cap,
    cachedTokens: 0,
  });
  expect(worst).toBeLessThanOrEqual(0.005);
  const expected = costUsd("muse-spark-1.3", {
    promptTokens,
    completionTokens: 250,
    cachedTokens: 0,
  });
  expect(expected).toBeLessThan(0.004);
});
