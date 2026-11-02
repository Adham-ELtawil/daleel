import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import type { Db } from "@/src/db/client";
import { getProblem } from "@/src/db/repo/problems";
import { attempts } from "@/src/db/schema";
import { resolveLocale } from "@/src/i18n";
import { BudgetReached, MetaApiError, OutputTruncated, SchemaError } from "@/src/llm/meta-client";
import { ReplayMiss } from "@/src/llm/replay/store";
import { explainAttempt, type ExplainDeps } from "./explain-service";
import { getCurrentUser } from "./current-user";
import { SessionSchema, startSession } from "./session";
import { createTeam, InviteSchema, joinTeam, teamStats } from "./teams";
import { demoSession } from "./demo-service";
import { HttpError } from "./http-error";
import { defaultCfApi, guardContest } from "./contest-guard";
import { resolveProblem } from "./problem-service";
import {
  attemptDetail,
  attemptHistory,
  markAttempt,
  ownedAttempt,
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
const codeAttemptSchema = z.strictObject({
  problemId: z.string().min(1),
  mode: z.literal("code").default("code"),
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
const attemptSchema = z.discriminatedUnion("mode", [
  codeAttemptSchema,
  z.strictObject({ problemId: z.string().min(1), mode: z.literal("idea") }).transform((fields) => ({
    ...fields,
    code: "",
    language: "cpp17" as const,
    parentAttemptId: undefined,
  })),
]);
const localeSchema = z.strictObject({ locale: z.enum(["en", "ar-EG"]).optional() });
const teamSchema = z.strictObject({ name: z.string().trim().min(1).max(100) });
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
  curl?: Parameters<typeof resolveProblem>[1]["curl"];
  cfApi?: Parameters<typeof resolveProblem>[1]["cfApi"];
  now?: () => number;
  log?: (event: { requestId: string; code: string }) => void;
  ladder?: AttemptDeps["ladder"];
  translate?: AttemptDeps["translate"];
  explain?: Pick<ExplainDeps, "llm" | "config">;
}) {
  const now = deps.now ?? Date.now;
  async function run(request: Request, job: (log: (code: string) => void) => Promise<unknown>) {
    const requestId = request.headers.get("x-request-id") ?? ulid();
    const log = (code: string) => (deps.log ?? console.error)({ requestId, code });
    const json = (data: unknown, status = 200) =>
      Response.json(data, { status, headers: { "x-request-id": requestId } });
    try {
      const result = await job(log);
      if (!(result instanceof Response)) return json(result);
      result.headers.set("x-request-id", requestId);
      return result;
    } catch (error) {
      const failure = error instanceof HttpError ? error : new HttpError(500, "internal_error");
      if (failure.status >= 500) log(failure.code);
      return json({ error: { code: failure.code, message: failure.message } }, failure.status);
    }
  }
  const attemptDeps = async (request: Request) => ({
    ...deps,
    db: await deps.db(),
    now,
    cookie: request.headers.get("cookie"),
  });
  const mark = (request: Request, id: string, status: "stuck" | "solved") =>
    run(request, async () => {
      await body(request, z.strictObject({}));
      return markAttempt(await attemptDeps(request), id, status);
    });
  return {
    session: (request: Request) =>
      run(request, async () => startSession(await deps.db(), await body(request, SessionSchema))),
    createTeam: (request: Request) =>
      run(request, async () => {
        const { name } = await body(request, teamSchema);
        const { db, cookie } = await attemptDeps(request);
        return createTeam(db, await getCurrentUser(db, cookie), name);
      }),
    joinTeam: (request: Request) =>
      run(request, async () => {
        const { inviteCode } = await body(request, z.strictObject({ inviteCode: InviteSchema }));
        const { db, cookie } = await attemptDeps(request);
        return { team: await joinTeam(db, await getCurrentUser(db, cookie), inviteCode) };
      }),
    teamStats: (request: Request, id: string) =>
      run(request, async () => {
        const { db, cookie } = await attemptDeps(request);
        const week = new URL(request.url).searchParams.get("week");
        return teamStats(db, await getCurrentUser(db, cookie), id, week);
      }),
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
            curl: deps.curl,
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
        const user = await getCurrentUser(db, request.headers.get("cookie"));
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
        const options = await attemptDeps(request);
        try {
          return await revealHint(options, id, locale);
        } catch (error) {
          if (error instanceof BudgetReached) throw new HttpError(503, "budget_reached");
          if (error instanceof HttpError) throw error;
          const attempt = await ownedAttempt(options.db, id, options.cookie);
          if (attempt.mode === "idea") {
            if (error instanceof ReplayMiss)
              throw new HttpError(503, "idea_replay_unavailable", locale ?? attempt.locale);
            if (
              error instanceof SchemaError ||
              error instanceof MetaApiError ||
              error instanceof OutputTruncated
            )
              throw new HttpError(503, "llm_error");
          }
          throw error;
        }
      }),
    explain: (request: Request, id: string) =>
      run(request, async () => {
        const { locale } = await body(request, localeSchema);
        if (!deps.explain) throw new HttpError(500, "internal_error");
        try {
          const options = { ...(await attemptDeps(request)), ...deps.explain };
          return await explainAttempt(options, id, locale);
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
        const locale =
          parsed.data.locale ??
          resolveLocale(
            request.headers.get("cookie")?.match(/(?:^|;\s*)daleel_locale=([^;]*)/)?.[1],
            request.headers.get("accept-language"),
          );
        return attemptDetail(await attemptDeps(request), id, locale);
      }),
    stuck: (request: Request, id: string) => mark(request, id, "stuck"),
    solved: (request: Request, id: string) => mark(request, id, "solved"),
    history: (request: Request) =>
      run(request, async () =>
        attemptHistory(
          await deps.db(),
          new URL(request.url).searchParams.get("cursor"),
          request.headers.get("cookie"),
        ),
      ),
  };
}
