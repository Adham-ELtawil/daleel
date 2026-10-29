import { gte, sum } from "drizzle-orm";
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
