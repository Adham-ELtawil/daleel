import { and, count, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import type { Db } from "@/src/db/client";
import { getProblem } from "@/src/db/repo/problems";
import { StoredDiagnosisSchema } from "@/src/db/json";
import { diagnoses, hintReveals, stressRuns, walkthroughs } from "@/src/db/schema";
import { validateExplanation } from "@/src/domain/explanation-validate";
import type { CallOptions, ChatMessage, LlmStepConfig } from "@/src/llm/meta-client";
import { buildExplainMessages } from "@/src/llm/prompts/explain";
import {
  ExplanationSchema,
  ExplanationPublicSchema,
  TraceSchema,
  type Explanation,
} from "@/src/llm/schemas/explanation";
import { canExplain, ownedAttempt } from "./attempt-service";
import { HttpError } from "./http-error";

export type ExplainDeps = {
  db: Db;
  cookie?: string | null;
  now: () => number;
  config: LlmStepConfig;
  llm: (
    config: LlmStepConfig,
    messages: ChatMessage[],
    options: CallOptions<Explanation>,
  ) => Promise<Explanation>;
};
// Runner output can exceed the model's 300-character prediction limit; retain it verbatim.
const StoredTraceSchema = TraceSchema.extend({
  expected_output: z.string(),
  student_output: z.string(),
});
function readWalkthrough(row: typeof walkthroughs.$inferSelect) {
  return {
    explanation: ExplanationPublicSchema.parse(JSON.parse(row.explanationJson)),
    trace: StoredTraceSchema.parse(JSON.parse(row.traceJson)),
  };
}
export async function explainAttempt(
  { db, now, config, llm, cookie }: ExplainDeps,
  id: string,
  locale?: "en" | "ar-EG",
) {
  const attempt = await ownedAttempt(db, id, cookie);
  if (attempt.mode === "idea") throw new HttpError(409, "idea_attempt");
  const [{ total }] = await db
    .select({ total: count() })
    .from(hintReveals)
    .where(eq(hintReveals.attemptId, id));
  if (!canExplain(total, attempt.status)) throw new HttpError(403, "locked");
  const language = locale ?? attempt.locale;
  const key = and(eq(walkthroughs.attemptId, id), eq(walkthroughs.locale, language));
  const cached = await db.select().from(walkthroughs).where(key).get();
  if (cached) return readWalkthrough(cached);
  const stored = await db.select().from(diagnoses).where(eq(diagnoses.attemptId, id)).get();
  if (!stored) throw new HttpError(409, "not_diagnosed");
  const diagnosis = StoredDiagnosisSchema.parse(JSON.parse(stored.resultJson)).value;
  const problem = await getProblem(db, attempt.problemId);
  if (!problem) throw new HttpError(404, "not_found");
  const stress =
    (await db.select().from(stressRuns).where(eq(stressRuns.attemptId, id)).get()) ?? null;
  const raw = await llm(
    config,
    buildExplainMessages({ problem, attempt, diagnosis, stress, locale: language }),
    {
      zod: ExplanationSchema,
      attemptId: id,
      userId: attempt.userId,
      cacheKey: `problem:${problem.id}`,
    },
  );
  const result = validateExplanation(ExplanationSchema.parse(raw), attempt.code, stress, language);
  const { trace, ...explanation } = result;
  await db
    .insert(walkthroughs)
    .values({
      id: ulid(now()),
      attemptId: id,
      locale: language,
      explanationJson: JSON.stringify(ExplanationPublicSchema.parse(explanation)),
      traceJson: JSON.stringify(StoredTraceSchema.parse(trace)),
      createdAt: now(),
    })
    .onConflictDoNothing();
  return readWalkthrough((await db.select().from(walkthroughs).where(key).get())!);
}
