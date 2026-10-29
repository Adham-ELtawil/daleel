import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import type { Db } from "@/src/db/client";
import { getProblem } from "@/src/db/repo/problems";
import { attempts } from "@/src/db/schema";
import { createCfApi } from "@/src/judges/cf-api";
import { getCurrentUser } from "./current-user";
import { HttpError } from "./http-error";
import { resolveProblem } from "./problem-service";

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
const defaultCfApi = createCfApi({ userAgent: process.env.SCRAPER_USER_AGENT ?? "Mozilla/5.0" });
export function createHandlers(deps: {
  db: () => Promise<Db>;
  fetch?: typeof fetch;
  cfApi?: Parameters<typeof resolveProblem>[1]["cfApi"];
  now?: () => number;
  log?: (event: { requestId: string; code: string }) => void;
}) {
  const now = deps.now ?? Date.now;
  async function run(request: Request, job: () => Promise<unknown>) {
    const requestId = request.headers.get("x-request-id") ?? ulid();
    const json = (data: unknown, status = 200) =>
      Response.json(data, { status, headers: { "x-request-id": requestId } });
    try {
      return json(await job());
    } catch (error) {
      const failure = error instanceof HttpError ? error : new HttpError(500, "internal_error");
      if (failure.status >= 500) (deps.log ?? console.error)({ requestId, code: failure.code });
      return json({ error: { code: failure.code, message: failure.message } }, failure.status);
    }
  }
  return {
    resolve: (request: Request) =>
      run(request, async () => {
        const input = await body(request, resolveSchema);
        return {
          problem: await resolveProblem(input, {
            db: await deps.db(),
            fetch: deps.fetch ?? globalThis.fetch,
            cfApi: deps.cfApi ?? defaultCfApi,
            now,
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
      run(request, async () => {
        const fields = await body(request, attemptSchema);
        const db = await deps.db();
        if (!(await getProblem(db, fields.problemId))) throw new HttpError(404, "not_found");
        if (
          fields.parentAttemptId &&
          !(await db
            .select({ id: attempts.id })
            .from(attempts)
            .where(eq(attempts.id, fields.parentAttemptId))
            .get())
        )
          throw new HttpError(404, "not_found");
        const user = await getCurrentUser(db);
        const createdAt = now();
        const attemptId = ulid(createdAt);
        await db.insert(attempts).values({
          ...fields,
          id: attemptId,
          userId: user.id,
          locale: user.locale,
          codeHash: createHash("sha256").update(fields.code).digest("hex"),
          status: "new",
          createdAt,
        });
        return { attemptId };
      }),
  };
}
