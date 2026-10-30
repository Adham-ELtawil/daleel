import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import type { Db } from "@/src/db/client";
import { getProblem } from "@/src/db/repo/problems";
import { attempts, diagnoses, hintLadders, stressRuns } from "@/src/db/schema";
import { applyFallback, validateLadder } from "@/src/domain/ladder-validator";
import type { CallOptions, ChatMessage, LlmStepConfig } from "@/src/llm/meta-client";
import { buildLadderMessages } from "@/src/llm/prompts/ladder";
import { DiagnosisSchema } from "@/src/llm/schemas/diagnosis";
import { HintLadderSchema, type HintLadder } from "@/src/llm/schemas/ladder";
import { HttpError } from "./http-error";

export type LadderDeps = {
  db: Db;
  llm: (
    config: LlmStepConfig,
    messages: ChatMessage[],
    options: CallOptions<HintLadder>,
  ) => Promise<HintLadder>;
  now: () => number;
  config: LlmStepConfig;
};
export async function ensureLadder(
  { db, llm, now, config }: LadderDeps,
  attemptId: string,
  locale: "en" | "ar-EG",
): Promise<HintLadder> {
  const key = and(eq(hintLadders.attemptId, attemptId), eq(hintLadders.locale, locale));
  const cached = await db.select().from(hintLadders).where(key).get();
  if (cached) return HintLadderSchema.parse({ levels: JSON.parse(cached.levelsJson) });
  const stored = await db.select().from(diagnoses).where(eq(diagnoses.attemptId, attemptId)).get();
  if (!stored) throw new HttpError(409, "not_diagnosed");
  const diagnosis = DiagnosisSchema.parse(JSON.parse(stored.resultJson));
  const attempt = await db.select().from(attempts).where(eq(attempts.id, attemptId)).get();
  const problem = attempt && (await getProblem(db, attempt.problemId));
  if (!attempt || !problem) throw new HttpError(404, "not_found");
  const stress = await db
    .select()
    .from(stressRuns)
    .where(eq(stressRuns.attemptId, attemptId))
    .get();
  const runnerResult =
    stress?.status === "verified" &&
    stress.failingInput !== null &&
    stress.expectedOutput !== null &&
    stress.actualOutput !== null
      ? {
          verified: true as const,
          input: stress.failingInput,
          expected: stress.expectedOutput,
          actual: stress.actualOutput,
        }
      : null;
  const context = {
    fixInternal: diagnosis.fix_internal,
    failingInput: runnerResult?.input ?? null,
  };
  const messages = buildLadderMessages({
    problem,
    diagnosis,
    runnerResult,
    code: attempt.code,
    locale,
  });
  const options = {
    zod: HintLadderSchema,
    attemptId,
    userId: attempt.userId,
    cacheKey: `problem:${problem.id}`,
  };
  const generate = async () => HintLadderSchema.parse(await llm(config, messages, options));
  let ladder = await generate();
  let checked = validateLadder(ladder, context);
  if (!checked.ok) {
    messages.push({
      role: "developer",
      content: `Your previous ladder violated these rules: ${JSON.stringify(checked.violations)}. Regenerate the ladder without those spoilers.`,
    });
    ladder = await generate();
    checked = validateLadder(ladder, context);
    if (!checked.ok) ladder = applyFallback(ladder, checked.violations, locale);
  }
  await db
    .insert(hintLadders)
    .values({
      id: ulid(now()),
      attemptId,
      locale,
      levelsJson: JSON.stringify(HintLadderSchema.parse(ladder).levels),
      createdAt: now(),
    })
    .onConflictDoNothing(); // a concurrent request may have stored the ladder first
  return ladder;
}
