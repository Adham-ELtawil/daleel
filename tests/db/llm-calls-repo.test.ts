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

describe("llmCallSummary (per-attempt Meta badge data)", () => {
  it("returns the latest successful or replayed call per step for one attempt", async () => {
    const { llmCallSummary } = await import("@/src/db/repo/llm-calls");
    const { sql } = await import("drizzle-orm");
    await db.run(sql`PRAGMA foreign_keys = OFF`); // repo-level unit: attempt rows are irrelevant
    const base = { ...rec(0.01), attemptId: "ATT" };
    await recordLlmCall(db, { ...base, latencyMs: 100 }, 1_000);
    await recordLlmCall(db, { ...base, latencyMs: 200 }, 2_000);
    await recordLlmCall(db, { ...base, status: "error", latencyMs: 300 }, 3_000);
    await recordLlmCall(db, { ...base, step: "ladder", status: "replay", latencyMs: 2 }, 2_500);
    await recordLlmCall(db, { ...base, attemptId: "OTHER", step: "explain" }, 2_600);
    expect(await llmCallSummary(db, "ATT")).toEqual({
      diagnose: { model: "muse-spark-1.3", latencyMs: 200, replay: false },
      ladder: { model: "muse-spark-1.3", latencyMs: 2, replay: true },
    });
  });
});
