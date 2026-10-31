import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import type { Db } from "@/src/db/client";
import { getProblem } from "@/src/db/repo/problems";
import { attempts } from "@/src/db/schema";
import { resolveLocale } from "@/src/i18n";
import { BudgetReached } from "@/src/llm/meta-client";
import { explainAttempt, type ExplainDeps } from "./explain-service";
import { getCurrentUser } from "./current-user";
import { demoSession } from "./demo-service";
import { HttpError } from "./http-error";
import { defaultCfApi, guardContest } from "./contest-guard";
import { resolveProblem } from "./problem-service";
import {
  attemptDetail,
  attemptHistory,
  markAttempt,
  revealHint,
  type AttemptDeps,
} from "./attempt-service";

const resolveSchema = z.union([
  z.strictObject({ url: z.string().trim().min(1) }),
  z.strictObject({
    statement: z
      .string()
      .max(20000)
      .refine((text) => text.trim().length > 0),
  }),
]);
const attemptSchema = z.strictObject({
  problemId: z.string().min(1),
  language: z.enum(["cpp17", "python3"]),
  code: z
    .string()
    .min(1)
    .refine((code) => Buffer.byteLength(code, "utf8") <= 65536, { message: "code_too_large" }),
  verdictReported: z.enum(["WA", "TLE", "MLE", "RE", "CE", "NONE"]).optional(),
  verdictTestNo: z.number().int().optional(),
  studentNote: z.string().max(1000).optional(),
  parentAttemptId: z.string().min(1).optional(),
});
const localeSchema = z.strictObject({ locale: z.enum(["en", "ar-EG"]).optional() });
async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const result = schema.safeParse(await request.json().catch(() => null));
  if (!result.success)
    throw new HttpError(
      400,
      result.error.issues.some((issue) => issue.message === "code_too_large")
        ? "code_too_large"
        : "invalid",
    );
  return result.data;
}
export function createHandlers(deps: {
  db: () => Promise<Db>;
  fetch?: typeof fetch;
  cfApi?: Parameters<typeof resolveProblem>[1]["cfApi"];
  now?: () => number;
  log?: (event: { requestId: string; code: string }) => void;
  ladder?: AttemptDeps["ladder"];
  explain?: Pick<ExplainDeps, "llm" | "config">;
}) {
  const now = deps.now ?? Date.now;
  async function run(request: Request, job: (log: (code: string) => void) => Promise<unknown>) {
    const requestId = request.headers.get("x-request-id") ?? ulid();
    const log = (code: string) => (deps.log ?? console.error)({ requestId, code });
    const json = (data: unknown, status = 200) =>
      Response.json(data, { status, headers: { "x-request-id": requestId } });
    try {
      return json(await job(log));
    } catch (error) {
      const failure = error instanceof HttpError ? error : new HttpError(500, "internal_error");
      if (failure.status >= 500) log(failure.code);
      return json({ error: { code: failure.code, message: failure.message } }, failure.status);
    }
  }
  const attemptDeps = async () => ({ ...deps, db: await deps.db(), now });
  const mark = (request: Request, id: string, status: "stuck" | "solved") =>
    run(request, async () => {
      await body(request, z.strictObject({}));
      return markAttempt(await attemptDeps(), id, status);
    });
  return {
    demo: (request: Request) =>
      run(request, async () => {
        await body(request, z.strictObject({}));
        return demoSession(await deps.db());
      }),
    resolve: (request: Request) =>
      run(request, async (log) => {
        const input = await body(request, resolveSchema);
        return {
          problem: await resolveProblem(input, {
            db: await deps.db(),
            fetch: deps.fetch ?? globalThis.fetch,
            cfApi: deps.cfApi ?? defaultCfApi,
            now,
            log,
          }),
        };
      }),
    problem: (request: Request, id: string) =>
      run(request, async () => {
        const problem = await getProblem(await deps.db(), id);
        if (!problem) throw new HttpError(404, "not_found");
        return { problem };
      }),
    attempt: (request: Request) =>
      run(request, async (log) => {
        const fields = await body(request, attemptSchema);
        const db = await deps.db();
        const problem = await getProblem(db, fields.problemId);
        if (!problem) throw new HttpError(404, "not_found");
        await guardContest(problem, { cfApi: deps.cfApi, log });
        const user = await getCurrentUser(db);
        if (fields.parentAttemptId) {
          const parent = await db
            .select({ problemId: attempts.problemId })
            .from(attempts)
            .where(and(eq(attempts.id, fields.parentAttemptId), eq(attempts.userId, user.id)))
            .get();
          if (!parent || parent.problemId !== fields.problemId) throw new HttpError(400, "invalid");
        }
        const createdAt = now();
        const attemptId = ulid(createdAt);
        await db.insert(attempts).values({
          ...fields,
          id: attemptId,
          userId: user.id,
          locale: resolveLocale(
            request.headers.get("cookie")?.match(/(?:^|;\s*)daleel_locale=([^;]*)/)?.[1],
            request.headers.get("accept-language") ?? user.locale,
          ),
          codeHash: createHash("sha256").update(fields.code).digest("hex"),
          status: "new",
          createdAt,
        });
        return { attemptId };
      }),
    nextHint: (request: Request, id: string) =>
      run(request, async () => {
        const { locale } = await body(request, localeSchema);
        return revealHint(await attemptDeps(), id, locale);
      }),
    explain: (request: Request, id: string) =>
      run(request, async () => {
        const { locale } = await body(request, localeSchema);
        if (!deps.explain) throw new HttpError(500, "internal_error");
        try {
          return await explainAttempt({ db: await deps.db(), now, ...deps.explain }, id, locale);
        } catch (error) {
          if (error instanceof BudgetReached) throw new HttpError(503, "budget_reached");
          throw error;
        }
      }),
    getAttempt: (request: Request, id: string) =>
      run(request, async () => {
        const parsed = localeSchema.safeParse({
          locale: new URL(request.url).searchParams.get("locale") ?? undefined,
        });
        if (!parsed.success) throw new HttpError(400, "invalid");
        return attemptDetail(await attemptDeps(), id, parsed.data.locale);
      }),
    stuck: (request: Request, id: string) => mark(request, id, "stuck"),
    solved: (request: Request, id: string) => mark(request, id, "solved"),
    history: (request: Request) =>
      run(request, async () =>
        attemptHistory(await deps.db(), new URL(request.url).searchParams.get("cursor")),
      ),
  };
}
