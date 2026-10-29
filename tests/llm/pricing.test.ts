import { describe, expect, it } from "vitest";
import { costUsd, PRICES } from "@/src/llm/pricing";

describe("LLM pricing", () => {
  it("lists the per-million-token rates for every supported model", () => {
    expect(PRICES).toEqual({
      "muse-spark-1.3": { input: 1.25, output: 4.25, cached: 0.15 },
      "muse-spark-1.2": { input: 1.25, output: 4.25, cached: 0.15 },
      "muse-spark-1.1": { input: 1.25, output: 4.25, cached: 0.15 },
      "muse-spark-1.3-contributor": { input: 0.1, output: 0.2, cached: 0.002 },
      "muse-spark-1.2-contributor": { input: 0.1, output: 0.2, cached: 0.002 },
      "muse-wonder-1.0": { input: 4, output: 20, cached: 0.2 },
    });
  });

  it("bills standard Spark input and output tokens", () => {
    const usage = { promptTokens: 4000, completionTokens: 3000, cachedTokens: 0 };
    expect(costUsd("muse-spark-1.3", usage)).toBeCloseTo(0.01775, 8);
  });

  it("bills cached prompt tokens at the cached rate instead of the input rate", () => {
    const usage = { promptTokens: 1000, completionTokens: 0, cachedTokens: 600 };
    expect(costUsd("muse-spark-1.3", usage)).toBeCloseTo((400 * 1.25 + 600 * 0.15) / 1e6, 8);
  });

  it.each(["muse-spark-1.3-contributor", "muse-spark-1.2-contributor"])(
    "bills contributor rates for %s",
    (model) => {
      const usage = { promptTokens: 4000, completionTokens: 3000, cachedTokens: 1000 };
      expect(costUsd(model, usage)).toBeCloseTo((3000 * 0.1 + 1000 * 0.002 + 3000 * 0.2) / 1e6, 8);
    },
  );

  it("conservatively bills unknown models at Wonder rates", () => {
    const cost = costUsd("unknown-model", {
      promptTokens: 1000,
      completionTokens: 100,
      cachedTokens: 600,
    });
    expect(cost).toBeCloseTo((400 * 4 + 600 * 0.2 + 100 * 20) / 1e6, 8);
    expect(cost).toBeGreaterThan(0);
  });
});
