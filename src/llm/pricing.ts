// Meta Model API prices in USD per 1M tokens (docs/03-ARCHITECTURE.md §5.1 [S5]).
export type Price = { input: number; output: number; cached: number };

const STANDARD: Price = { input: 1.25, output: 4.25, cached: 0.15 };
const CONTRIBUTOR: Price = { input: 0.1, output: 0.2, cached: 0.002 };
const WONDER: Price = { input: 4, output: 20, cached: 0.2 };

export const PRICES: Record<string, Price> = {
  "muse-spark-1.3": STANDARD,
  "muse-spark-1.2": STANDARD,
  "muse-spark-1.1": STANDARD,
  "muse-spark-1.3-contributor": CONTRIBUTOR,
  "muse-spark-1.2-contributor": CONTRIBUTOR,
  "muse-wonder-1.0": WONDER,
};

export type Usage = { promptTokens: number; completionTokens: number; cachedTokens: number };

/** Billed cost of one call. Unknown models use the most expensive known rates so the budget guard never under-counts. */
export function costUsd(model: string, usage: Usage): number {
  const price = PRICES[model] ?? WONDER;
  const cached = Math.min(usage.cachedTokens, usage.promptTokens);
  return (
    ((usage.promptTokens - cached) * price.input +
      cached * price.cached +
      usage.completionTokens * price.output) /
    1e6
  );
}
