import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import type { Db } from "@/src/db/client";
import { getProblem } from "@/src/db/repo/problems";
import { StoredDiagnosisSchema, StoredLadderSchema } from "@/src/db/json";
import { attempts, diagnoses, hintLadders, stressRuns } from "@/src/db/schema";
import { applyFallback, validateLadder } from "@/src/domain/ladder-validator";
import { fixArabicPublicText } from "@/src/domain/arabic-style";
import type { CallOptions, ChatMessage, LlmStepConfig } from "@/src/llm/meta-client";
import { buildIdeaLadderMessages, buildLadderMessages } from "@/src/llm/prompts/ladder";
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
function readLadder(json: string) {
  const { value, recordedAt } = StoredLadderSchema.parse(JSON.parse(json));
  return { ...value, replay: recordedAt !== null, recordedAt };
}
export async function ensureLadder(
  { db, llm, now, config }: LadderDeps,
  attemptId: string,
  locale: "en" | "ar-EG",
) {
  const key = and(eq(hintLadders.attemptId, attemptId), eq(hintLadders.locale, locale));
  const cached = await db.select().from(hintLadders).where(key).get();
  if (cached) return readLadder(cached.levelsJson);
  const attempt = await db.select().from(attempts).where(eq(attempts.id, attemptId)).get();
  const problem = attempt && (await getProblem(db, attempt.problemId));
  if (!attempt || !problem) throw new HttpError(404, "not_found");
  const idea = attempt.mode === "idea";
  const stored = idea
    ? undefined
    : await db.select().from(diagnoses).where(eq(diagnoses.attemptId, attemptId)).get();
  if (!idea && !stored) throw new HttpError(409, "not_diagnosed");
  const diagnosis = stored
    ? StoredDiagnosisSchema.parse(JSON.parse(stored.resultJson)).value
    : null;
  const stress = idea
    ? undefined
    : await db.select().from(stressRuns).where(eq(stressRuns.attemptId, attemptId)).get();
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
    fixInternal: diagnosis?.fix_internal ?? "",
    failingInput: runnerResult?.input ?? null,
    mode: attempt.mode,
  };
  const messages = diagnosis
    ? buildLadderMessages({
        problem,
        diagnosis,
        runnerResult,
        code: attempt.code,
        locale,
      })
    : buildIdeaLadderMessages({ problem, locale });
  let recordedAt: string | null = null;
  const options = {
    zod: HintLadderSchema,
    attemptId,
    userId: attempt.userId,
    cacheKey: `problem:${problem.id}`,
    onReplay: (date: string) => {
      recordedAt = date;
    },
  };
  const generate = async () => {
    recordedAt = null;
    return HintLadderSchema.parse(
      await llm(idea ? { ...config, step: "idea" } : config, messages, options),
    );
  };
  let ladder = await generate();
  let checked = validateLadder(ladder, context);
  if (!checked.ok) {
    messages.push({
      role: "developer",
      content: `Your previous ladder violated these rules: ${JSON.stringify(checked.violations)}. Regenerate the ladder without those spoilers.`,
    });
    ladder = await generate();
    checked = validateLadder(ladder, context);
    if (!checked.ok) ladder = applyFallback(ladder, checked.violations, locale, attempt.mode);
  }
  if (locale === "ar-EG") {
    ladder = {
      levels: ladder.levels.map((hint) => ({
        ...hint,
        title: fixArabicPublicText(hint.title).slice(0, 80),
        body_md: fixArabicPublicText(hint.body_md).slice(0, 1500),
        question_back:
          hint.question_back === null
            ? null
            : fixArabicPublicText(hint.question_back).slice(0, 200),
      })),
    };
  }
  await db
    .insert(hintLadders)
    .values({
      id: ulid(now()),
      attemptId,
      locale,
      levelsJson: JSON.stringify(StoredLadderSchema.parse({ value: ladder, recordedAt })),
      createdAt: now(),
    })
    .onConflictDoNothing(); // a concurrent request may have stored the ladder first
  const saved = (await db.select().from(hintLadders).where(key).get())!;
  return readLadder(saved.levelsJson);
}
