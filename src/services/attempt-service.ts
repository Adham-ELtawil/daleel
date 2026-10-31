import { and, count, desc, eq, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/src/db/client";
import { getProblem } from "@/src/db/repo/problems";
import { StoredDiagnosisSchema, StoredLadderSchema, StoredStressTestsSchema } from "@/src/db/json";
import {
  attempts,
  diagnoses,
  hintLadders,
  hintReveals,
  problems,
  stressRuns,
} from "@/src/db/schema";
import { StressPublicSchema } from "@/src/domain/stress-public";
import { toPublic } from "@/src/llm/schemas/diagnosis";
import type { HintLadder } from "@/src/llm/schemas/ladder";
import { getCurrentUser } from "./current-user";
import { HttpError } from "./http-error";
import { ensureLadder, type LadderDeps } from "./ladder-service";

export type AttemptDeps = {
  db: Db;
  cookie?: string | null;
  now: () => number;
  ladder?: Pick<LadderDeps, "llm" | "config">;
};
export async function ownedAttempt(db: Db, id: string, cookie?: string | null) {
  const user = await getCurrentUser(db, cookie);
  const attempt = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.id, id), eq(attempts.userId, user.id)))
    .get();
  if (!attempt) throw new HttpError(404, "not_found");
  return attempt;
}
export function canExplain(revealed: number, status: string) {
  return revealed >= 3 || status === "stuck";
}
function ladderFor(deps: AttemptDeps, id: string, locale: "en" | "ar-EG") {
  if (!deps.ladder) throw new HttpError(500, "internal_error");
  return ensureLadder({ ...deps, ...deps.ladder }, id, locale);
}
function publicHint(hint: HintLadder["levels"][number]) {
  return {
    level: hint.level,
    title: hint.title,
    body_md: hint.body_md,
    question_back: hint.question_back,
  };
}
export async function revealHint(deps: AttemptDeps, id: string, locale?: "en" | "ar-EG") {
  const { db, now } = deps;
  const attempt = await ownedAttempt(db, id, deps.cookie);
  if (
    !(await db
      .select({ id: diagnoses.id })
      .from(diagnoses)
      .where(eq(diagnoses.attemptId, id))
      .get())
  )
    throw new HttpError(425, "not_diagnosed");
  const key = eq(hintReveals.attemptId, id);
  const [{ total }] = await db.select({ total: count() }).from(hintReveals).where(key);
  if (total >= 4) throw new HttpError(409, "no_more_hints");
  const ladder = await ladderFor(deps, id, locale ?? attempt.locale);
  // libSQL batch is one write transaction. Count inside INSERT serializes concurrent reveals.
  const [inserted] = await db.batch([
    db
      .insert(hintReveals)
      .select(
        db
          .select({
            attemptId: sql<string>`${id}`.as("attempt_id"),
            level: sql<number>`count(*) + 1`.as("level"),
            revealedAt: sql<number>`${now()}`.as("revealed_at"),
          })
          .from(hintReveals)
          .where(key)
          .having(sql`count(*) < 4`),
      )
      .returning({ level: hintReveals.level }),
    db
      .update(attempts)
      .set({
        maxHintLevel: sql`(select count(*) from hint_reveals where attempt_id = ${id})`,
      })
      .where(eq(attempts.id, id)),
  ]);
  const level = inserted[0]?.level;
  if (!level) throw new HttpError(409, "no_more_hints");
  return {
    hint: publicHint(ladder.levels[level - 1]),
    remaining: 4 - level,
    replay: ladder.replay,
    recordedAt: ladder.recordedAt,
  };
}
export async function attemptDetail(deps: AttemptDeps, id: string, locale?: "en" | "ar-EG") {
  const stored = await ownedAttempt(deps.db, id, deps.cookie);
  const problem = await getProblem(deps.db, stored.problemId);
  const diagnosis = await deps.db.select().from(diagnoses).where(eq(diagnoses.attemptId, id)).get();
  const reveals = await deps.db
    .select()
    .from(hintReveals)
    .where(eq(hintReveals.attemptId, id))
    .orderBy(hintReveals.level);
  const ladder = reveals.length ? await ladderFor(deps, id, locale ?? stored.locale) : null;
  const ladderRow =
    !ladder &&
    (await deps.db
      .select({ levelsJson: hintLadders.levelsJson })
      .from(hintLadders)
      .where(and(eq(hintLadders.attemptId, id), eq(hintLadders.locale, locale ?? stored.locale)))
      .get());
  const recordedAt = ladder
    ? ladder.recordedAt
    : ladderRow
      ? StoredLadderSchema.parse(JSON.parse(ladderRow.levelsJson)).recordedAt
      : null;
  const result = diagnosis && StoredDiagnosisSchema.parse(JSON.parse(diagnosis.resultJson));
  const stress = await deps.db.select().from(stressRuns).where(eq(stressRuns.attemptId, id)).get();
  const metadata = stress && StoredStressTestsSchema.parse(JSON.parse(stress.testsJson));
  const attempt = {
    id: stored.id,
    problemId: stored.problemId,
    parentAttemptId: stored.parentAttemptId,
    language: stored.language,
    code: stored.code,
    verdictReported: stored.verdictReported,
    verdictTestNo: stored.verdictTestNo,
    studentNote: stored.studentNote,
    locale: stored.locale,
    status: stored.status,
    maxHintLevel: stored.maxHintLevel,
    solvedAt: stored.solvedAt,
    createdAt: stored.createdAt,
  };
  return {
    attempt,
    problem,
    ...(stress && metadata
      ? {
          stress: StressPublicSchema.parse({
            status: stress.status,
            failing_input: stress.failingInput,
            expected_output: stress.expectedOutput,
            actual_output: stress.actualOutput,
            compile_output: stress.compileOutput,
            source: metadata.source,
            contradiction: metadata.contradiction,
          }),
        }
      : {}),
    ...(result
      ? {
          diagnosis: {
            ...toPublic(result.value),
            replay: result.recordedAt !== null,
            recordedAt: result.recordedAt,
          },
        }
      : {}),
    replay: recordedAt !== null,
    recordedAt,
    revealedHints: ladder ? reveals.map((r) => publicHint(ladder.levels[r.level - 1])) : [],
    canExplain: canExplain(reveals.length, stored.status),
  };
}
export async function markAttempt(deps: AttemptDeps, id: string, status: "stuck" | "solved") {
  await ownedAttempt(deps.db, id, deps.cookie);
  await deps.db
    .update(attempts)
    .set({ status, solvedAt: status === "solved" ? deps.now() : null })
    .where(eq(attempts.id, id));
  return status === "stuck" ? { canExplain: true } : { ok: true };
}
const CursorSchema = z.tuple([z.number().int().nonnegative(), z.string().min(1)]);
export async function attemptHistory(db: Db, cursor: string | null, cookie?: string | null) {
  const user = await getCurrentUser(db, cookie);
  let before: SQL | undefined;
  if (cursor !== null) {
    let raw: unknown;
    try {
      raw = JSON.parse(cursor);
    } catch {
      throw new HttpError(400, "invalid");
    }
    const parsed = CursorSchema.safeParse(raw);
    if (!parsed.success) throw new HttpError(400, "invalid");
    const [createdAt, id] = parsed.data;
    before = or(
      lt(attempts.createdAt, createdAt),
      and(eq(attempts.createdAt, createdAt), lt(attempts.id, id)),
    );
  }
  const rows = await db
    .select({
      id: attempts.id,
      problemTitle: problems.title,
      bugClass: diagnoses.bugClass,
      status: attempts.status,
      maxHintLevel: attempts.maxHintLevel,
      createdAt: attempts.createdAt,
    })
    .from(attempts)
    .innerJoin(problems, eq(problems.id, attempts.problemId))
    .leftJoin(diagnoses, eq(diagnoses.attemptId, attempts.id))
    .where(and(eq(attempts.userId, user.id), before))
    .orderBy(desc(attempts.createdAt), desc(attempts.id))
    .limit(21);
  const items = rows.slice(0, 20);
  const last = items.at(-1);
  return {
    items,
    ...(rows.length > 20 && last ? { nextCursor: JSON.stringify([last.createdAt, last.id]) } : {}),
  };
}
