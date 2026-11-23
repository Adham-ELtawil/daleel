import { createHash } from "node:crypto";
import { and, eq, gte, isNull, lt, ne, or } from "drizzle-orm";
import { ulid } from "ulid";
import type { Db } from "@/src/db/client";
import { getProblem } from "@/src/db/repo/problems";
import { StoredDiagnosisSchema, StoredStressTestsSchema, TagsSchema } from "@/src/db/json";
import {
  attempts,
  diagnoses,
  diagnosisTranslations,
  hintLadders,
  hintReveals,
  stressRuns,
  walkthroughs,
} from "@/src/db/schema";
import { codeLines } from "@/src/domain/code-lines";
import { validateDiagnosis } from "@/src/domain/diagnosis-validate";
import { fixArabicPublicText } from "@/src/domain/arabic-style";
import { probeHeadline } from "@/src/domain/probe-headline";
import { previewSummary, streamedBugFound } from "@/src/domain/run-verdict";
import { StressPublicSchema, type StressPublic } from "@/src/domain/stress-public";
import {
  BudgetReached,
  SchemaError,
  OutputTruncated,
  type CallOptions,
  type ChatMessage,
  type LlmStepConfig,
} from "@/src/llm/meta-client";
import { buildDiagnoseMessages } from "@/src/llm/prompts/diagnose";
import { buildSnapMessages } from "@/src/llm/prompts/snap";
import { buildStressMessages } from "@/src/llm/prompts/stress";
import { SnapSchema, type Snap } from "@/src/llm/schemas/snap";
import { DiagnosisSchema, toPublic, type Diagnosis } from "@/src/llm/schemas/diagnosis";
import { StressPlanSchema, type StressPlan } from "@/src/llm/schemas/stress";
import { t } from "@/src/i18n";
import { HttpError } from "./http-error";
import type { DiagnoseEvent } from "./sse";
import { ensureLadder, type LadderDeps } from "./ladder-service";
import {
  probeStudentSamples,
  stressAttempt,
  withRunContradiction,
  type StressDeps,
} from "./stress";

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
  /** Live attempts overlap the counterexample model with diagnosis. Replay and record stay sequential. */
  parallelStress?: boolean;
  /** Cheap first sentence. Omitted in replay and record so those hashes stay unchanged. */
  snap?: {
    config: LlmStepConfig;
    llm: (
      config: LlmStepConfig,
      messages: ChatMessage[],
      options: CallOptions<Snap>,
    ) => Promise<Snap>;
  };
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
  if (attempt.mode === "idea") throw new HttpError(409, "idea_attempt");
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
  const stressAbort = new AbortController();
  let earlyPlan: Promise<StressPlan | null> | undefined;
  try {
    if (retry) {
      await db.transaction(async (tx) => {
        for (const table of [
          diagnoses,
          diagnosisTranslations,
          hintLadders,
          hintReveals,
          stressRuns,
          walkthroughs,
        ])
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
    let preview = "";
    let settled = false;
    const rank = { probe: 1, snap: 2, model: 3 } as const;
    let previewRank = 0;
    const showPreview = (text: string, source: keyof typeof rank) => {
      const sentence = text.trim().slice(0, 240);
      if (settled || !sentence || rank[source] < previewRank || sentence === preview) return;
      preview = sentence;
      previewRank = rank[source];
      emit({ event: "preview", data: { public_summary: sentence } });
    };
    const ahead: { hit: StressPublic | null } = { hit: null };
    const canOverlap =
      !saved &&
      deps.parallelStress === true &&
      deps.stress !== undefined &&
      attempt.language === "cpp17" &&
      deps.stress.runner.name !== "none";
    if (canOverlap && deps.stress) {
      const stress = deps.stress;
      earlyPlan = (async () => {
        try {
          emit({ event: "stage", data: { name: "checking_samples" } });
          const probe = await probeStudentSamples(stress.runner, problem, attempt.code);
          if (stressAbort.signal.aborted) return null;
          showPreview(
            probeHeadline(
              attempt.locale,
              probe.kind === "hit"
                ? {
                    kind: "hit",
                    status:
                      probe.result.status === "compile_error"
                        ? "compile"
                        : (probe.result.student_status ?? "re"),
                  }
                : probe,
            ),
            "probe",
          );
          if (probe.kind === "hit") {
            ahead.hit = probe.result;
            return null;
          }
          emit({ event: "stage", data: { name: "samples_clear" } });
          if (stressAbort.signal.aborted) return null;
          const plan = await stress.llm(stress.config, buildStressMessages({ problem, attempt }), {
            zod: StressPlanSchema,
            attemptId,
            userId: attempt.userId,
            cacheKey: `problem:${problem.id}`,
            signal: stressAbort.signal,
          });
          return stressAbort.signal.aborted ? null : plan;
        } catch {
          return null;
        }
      })();
    }
    const live = !saved && process.env.DEMO_REPLAY !== "1" && process.env.DEMO_RECORD !== "1";
    if (live && deps.snap) {
      const snap = deps.snap;
      void snap
        .llm(snap.config, buildSnapMessages({ problem, attempt, locale: attempt.locale }), {
          zod: SnapSchema,
          attemptId,
          userId: attempt.userId,
          cacheKey: `problem:${problem.id}`,
        })
        .then((value) => {
          const text =
            attempt.locale === "ar-EG"
              ? fixArabicPublicText(value.public_summary).slice(0, 240)
              : value.public_summary;
          showPreview(text, "snap");
        })
        .catch(() => undefined);
    }
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
            onDelta: (text) => {
              if (streamedBugFound(text) === false) stressAbort.abort();
              let summary = previewSummary(text);
              if (!summary) return;
              if (attempt.locale === "ar-EG") summary = fixArabicPublicText(summary).slice(0, 240);
              showPreview(summary, "model");
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
      if (!saved)
        await tx
          .delete(diagnosisTranslations)
          .where(eq(diagnosisTranslations.attemptId, attemptId));
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
    settled = true;
    if (!result.bug_found) stressAbort.abort();
    if (deps.stress && result.bug_found) {
      try {
        const storedStress = await db
          .select()
          .from(stressRuns)
          .where(eq(stressRuns.attemptId, attemptId))
          .get();
        if (storedStress) {
          const metadata = StoredStressTestsSchema.parse(JSON.parse(storedStress.testsJson));
          emit({
            event: "stress",
            data: {
              result: StressPublicSchema.parse({
                status: storedStress.status,
                failing_input: storedStress.failingInput,
                expected_output: storedStress.expectedOutput,
                actual_output: storedStress.actualOutput,
                compile_output: storedStress.compileOutput,
                source: metadata.source,
                contradiction: metadata.contradiction,
                student_status:
                  metadata.student_status ?? (storedStress.status === "verified" ? "wa" : null),
              }),
            },
          });
        } else {
          const plan = earlyPlan ? await earlyPlan : null;
          const stressDeps = { db, now, log: deps.log, ...deps.stress };
          const stress = ahead.hit
            ? await stressAttempt(stressDeps, attemptId, {
                preset: withRunContradiction(ahead.hit, result),
              })
            : await stressAttempt(stressDeps, attemptId, plan ? { plan } : undefined);
          emit({ event: "stress", data: { result: stress } });
        }
      } catch {
        (deps.log ?? ((code) => console.error({ requestId: attemptId, code })))("stress_error");
      }
    } else {
      stressAbort.abort();
      await earlyPlan?.catch(() => undefined);
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
    stressAbort.abort();
    await earlyPlan?.catch(() => undefined);
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
