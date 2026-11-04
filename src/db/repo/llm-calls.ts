import { and, desc, eq, gte, inArray, sum } from "drizzle-orm";
import { ulid } from "ulid";
import type { LlmCallRecord } from "@/src/llm/meta-client";
import type { Db } from "../client";
import { llmCalls } from "../schema";

export async function recordLlmCall(db: Db, rec: LlmCallRecord, createdAt: number): Promise<void> {
  await db.insert(llmCalls).values({ ...rec, id: ulid(createdAt), createdAt });
}

export async function sumLlmCostSince(db: Db, sinceMs: number): Promise<number> {
  const row = await db
    .select({ cost: sum(llmCalls.costUsd) })
    .from(llmCalls)
    .where(gte(llmCalls.createdAt, sinceMs))
    .get();
  return Number(row?.cost ?? 0);
}

export type LlmCallInfo = { model: string; latencyMs: number; replay: boolean };
export type LlmCallStep = (typeof llmCalls.$inferSelect)["step"];

/** Latest successful (live or replayed) call per pipeline step for one attempt; feeds the UI Meta badge. */
export async function llmCallSummary(
  db: Db,
  attemptId: string,
): Promise<Partial<Record<LlmCallStep, LlmCallInfo>>> {
  const rows = await db
    .select({
      step: llmCalls.step,
      model: llmCalls.model,
      latencyMs: llmCalls.latencyMs,
      status: llmCalls.status,
    })
    .from(llmCalls)
    .where(and(eq(llmCalls.attemptId, attemptId), inArray(llmCalls.status, ["ok", "replay"])))
    .orderBy(desc(llmCalls.createdAt), desc(llmCalls.id));
  const summary: Partial<Record<LlmCallStep, LlmCallInfo>> = {};
  for (const row of rows)
    summary[row.step] ??= {
      model: row.model,
      latencyMs: row.latencyMs,
      replay: row.status === "replay",
    };
  return summary;
}
