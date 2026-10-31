import { createHash } from "node:crypto";
import { and, eq, gte, isNull, lt, ne, or } from "drizzle-orm";
import { ulid } from "ulid";
import type { Db } from "@/src/db/client";
import { getProblem } from "@/src/db/repo/problems";
import { StoredDiagnosisSchema, TagsSchema } from "@/src/db/json";
import {
  attempts,
  diagnoses,
  hintLadders,
  hintReveals,
  stressRuns,
  walkthroughs,
} from "@/src/db/schema";
import { codeLines } from "@/src/domain/code-lines";
import { validateDiagnosis } from "@/src/domain/diagnosis-validate";
import { fixArabicPublicText } from "@/src/domain/arabic-style";
import {
  BudgetReached,
  SchemaError,
  OutputTruncated,
  type CallOptions,
  type ChatMessage,
  type LlmStepConfig,
} from "@/src/llm/meta-client";
import { buildDiagnoseMessages } from "@/src/llm/prompts/diagnose";
import { DiagnosisSchema, toPublic, type Diagnosis } from "@/src/llm/schemas/diagnosis";
import { t } from "@/src/i18n";
import { HttpError } from "./http-error";
import type { DiagnoseEvent } from "./sse";
import { ensureLadder, type LadderDeps } from "./ladder-service";
import { stressAttempt, type StressDeps } from "./stress";

// Keep stale claims older than the 120s LLM deadline.
export const STALE_MS = 150000;

export type DiagnoseDeps = {
  db: Db;
  llm: (
    config: LlmStepConfig,
    messages: ChatMessage[],
    options: CallOptions<Diagnosis>,
  ) => Promise<Diagnosis>;
  config: LlmStepConfig;
  now: () => number;
  ladder: Pick<LadderDeps, "llm" | "config">;
  stress?: Pick<StressDeps, "llm" | "config" | "runner">;
  log?: (code: string) => void;
};
async function withDeadline(job: (signal: AbortSignal) => Promise<Diagnosis>) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      job(controller.signal),
      new Promise<Diagnosis>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("diagnosis_timeout"));
        }, 120000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function cacheHash(attempt: typeof attempts.$inferSelect) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        attempt.problemId,
        attempt.language,
        codeLines(attempt.code).join("\n"),
        attempt.verdictReported,
        attempt.verdictTestNo,
      ]),
    )
    .digest("hex");
}
export async function diagnoseAttempt(
  deps: DiagnoseDeps,
  attemptId: string,
  emit: (event: DiagnoseEvent) => void,
  retry = false,
): Promise<void> {
  const { db, llm, config, now } = deps;
  const attempt = await db.select().from(attempts).where(eq(attempts.id, attemptId)).get();
  const problem = attempt && (await getProblem(db, attempt.problemId));
  if (!attempt || !problem) throw new HttpError(404, "not_found");
  const diagnosingSince = now();
  const claimed = await db
    .update(attempts)
    .set({ status: "diagnosing", diagnosingSince })
    .where(
      and(
        eq(attempts.id, attemptId),
        or(
          ne(attempts.status, "diagnosing"),
          isNull(attempts.diagnosingSince),
          lt(attempts.diagnosingSince, diagnosingSince - STALE_MS),
        ),
      ),
    )
    .returning({ id: attempts.id })
    .get();
  if (!claimed) throw new HttpError(409, "already_running");
  try {
    if (retry) {
      await db.transaction(async (tx) => {
        for (const table of [diagnoses, hintLadders, hintReveals, stressRuns, walkthroughs])
          await tx.delete(table).where(eq(table.attemptId, attemptId));
        await tx
          .update(attempts)
          .set({ maxHintLevel: 0, solvedAt: null })
          .where(eq(attempts.id, attemptId));
      });
    }
    emit({ event: "stage", data: { name: "reading" } });
    // Keep the original diagnosis timestamp on copies so reuse never extends the 24h TTL.
    const candidates = await db
      .select({ attempt: attempts, diagnosis: diagnoses })
      .from(attempts)
      .innerJoin(diagnoses, eq(diagnoses.attemptId, attempts.id))
      .where(
        and(
          eq(attempts.problemId, attempt.problemId),
          eq(attempts.locale, attempt.locale),
          gte(diagnoses.createdAt, now() - 86400000),
        ),
      );
    const cached = candidates.find(
      (row) => !retry && cacheHash(row.attempt) === cacheHash(attempt),
    );
    const saved = cached && StoredDiagnosisSchema.parse(JSON.parse(cached.diagnosis.resultJson));
    let recordedAt: string | null = saved?.recordedAt ?? null;
    emit({ event: "stage", data: { name: "thinking" } });
    const raw = saved
      ? saved.value
      : await withDeadline((signal) =>
          llm(config, buildDiagnoseMessages({ problem, attempt, locale: attempt.locale }), {
            signal,
            zod: DiagnosisSchema,
            attemptId,
            userId: attempt.userId,
            cacheKey: `problem:${problem.id}`,
            onReplay: (date) => {
              recordedAt = date;
            },
          }),
        );
    emit({ event: "stage", data: { name: "validating" } });
    const parsed = DiagnosisSchema.safeParse(raw);
    if (!parsed.success) throw new SchemaError("invalid_diagnosis");
    const result = validateDiagnosis(parsed.data, attempt.code);
    if (attempt.locale === "ar-EG") {
      result.public_summary = fixArabicPublicText(result.public_summary).slice(0, 240);
      result.approach = {
        ...result.approach,
        student_idea_public: fixArabicPublicText(result.approach.student_idea_public).slice(0, 300),
      };
    }
    const values = {
      id: ulid(now()),
      attemptId,
      resultJson: JSON.stringify(StoredDiagnosisSchema.parse({ value: result, recordedAt })),
      bugClass: result.bug_class,
      topicsJson: JSON.stringify(TagsSchema.parse(result.topics)),
      confidence: result.confidence,
      model: cached?.diagnosis.model ?? config.model,
      reasoningEffort: cached?.diagnosis.reasoningEffort ?? config.reasoningEffort,
      createdAt: cached?.diagnosis.createdAt ?? now(),
    };
    await db.transaction(async (tx) => {
      await tx
        .insert(diagnoses)
        .values(values)
        .onConflictDoUpdate({ target: diagnoses.attemptId, set: values });
      await tx.update(attempts).set({ diagnosingSince: now() }).where(eq(attempts.id, attemptId));
    });
    emit({
      event: "diagnosis",
      data: { public: toPublic(result), replay: recordedAt !== null, recordedAt },
    });
    if (deps.stress && result.bug_found) {
      try {
        const stress = await stressAttempt({ db, now, log: deps.log, ...deps.stress }, attemptId);
        emit({ event: "stress", data: { result: stress } });
      } catch {
        (deps.log ?? ((code) => console.error({ requestId: attemptId, code })))("stress_error");
      }
    }
    await db.update(attempts).set({ diagnosingSince: now() }).where(eq(attempts.id, attemptId));
    try {
      await ensureLadder({ db, now, ...deps.ladder }, attemptId, attempt.locale);
      emit({ event: "ladder_ready", data: { levels: 4 } });
    } catch {
      (deps.log ?? ((code) => console.error({ requestId: attemptId, code })))("ladder_error");
    }
    await db
      .update(attempts)
      .set({ status: "diagnosed", diagnosingSince: null })
      .where(eq(attempts.id, attemptId));
    emit({ event: "done", data: {} });
  } catch (error) {
    await db
      .update(attempts)
      .set({ status: "error", diagnosingSince: null })
      .where(eq(attempts.id, attemptId));
    const code =
      error instanceof BudgetReached
        ? "budget_reached"
        : error instanceof SchemaError
          ? "schema_error"
          : error instanceof OutputTruncated
            ? "truncated"
            : "llm_error";
    emit({ event: "error", data: { code, message: t(code, attempt.locale) } });
  }
}
