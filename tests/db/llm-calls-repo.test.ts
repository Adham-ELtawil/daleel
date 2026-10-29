import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/src/db/client";
import { recordLlmCall, sumLlmCostSince } from "@/src/db/repo/llm-calls";
import type { LlmCallRecord } from "@/src/llm/meta-client";
import { tempDb } from "./helpers";

let db: Db;
let cleanup: () => void;
beforeEach(async () => ({ db, cleanup } = await tempDb()));
afterEach(() => cleanup());

const rec = (costUsd: number): LlmCallRecord => ({
  step: "diagnose",
  attemptId: null,
  model: "muse-spark-1.3",
  requestHash: "a".repeat(64),
  status: "ok",
  httpStatus: 200,
  inputTokens: 100,
  outputTokens: 50,
  cachedTokens: 0,
  reasoningTokens: 30,
  costUsd,
  latencyMs: 12,
  error: null,
});

describe("llm_calls repo (feeds the meta-client budget guard)", () => {
  it("sums cost of calls created at or after a timestamp", async () => {
    await recordLlmCall(db, rec(0.5), 1_000);
    await recordLlmCall(db, rec(0.25), 2_000);
    await recordLlmCall(db, rec(0.125), 3_000);
    expect(await sumLlmCostSince(db, 2_000)).toBeCloseTo(0.375, 10);
  });

  it("returns 0 when there are no calls", async () => {
    expect(await sumLlmCostSince(db, 0)).toBe(0);
  });
});
