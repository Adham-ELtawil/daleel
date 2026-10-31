import type { Db } from "@/src/db/client";
import { getProblem } from "@/src/db/repo/problems";
import { ulid } from "ulid";
import { z } from "zod";
import { diagnoseAttempt, type DiagnoseDeps } from "./diagnose-service";
import { HttpError } from "./http-error";
import { guardContest, type ContestGuardDeps } from "./contest-guard";
import { serializeSse } from "./sse";
import { ownedAttempt } from "./attempt-service";

export function createDiagnoseHandler(
  deps: Omit<DiagnoseDeps, "db" | "log"> & {
    db: () => Promise<Db>;
    cfApi?: ContestGuardDeps["cfApi"];
    log?: (event: { requestId: string; code: string }) => void;
  },
) {
  return async (request: Request, id: string) => {
    const requestId = request.headers.get("x-request-id") ?? ulid();
    const log = (code: string) => (deps.log ?? console.error)({ requestId, code });
    try {
      const body = z
        .strictObject({ retry: z.boolean().default(false) })
        .safeParse(await request.json().catch(() => null));
      if (!body.success) throw new HttpError(400, "invalid");
      const db = await deps.db();
      const attempt = await ownedAttempt(db, id, request.headers.get("cookie"));
      const problem = await getProblem(db, attempt.problemId);
      if (!problem) throw new HttpError(404, "not_found");
      await guardContest(problem, { cfApi: deps.cfApi, log });
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        start(value) {
          controller = value;
        },
        cancel() {
          cancelled = true;
        },
      });
      await new Promise<void>((resolve, reject) => {
        void diagnoseAttempt(
          { ...deps, db, log },
          id,
          (event) => {
            if (event.event === "error") log(event.data.code);
            if (!cancelled) controller.enqueue(new TextEncoder().encode(serializeSse(event)));
            resolve();
          },
          body.data.retry,
        )
          .catch(reject)
          .finally(() => {
            if (!cancelled) controller.close();
          });
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "x-request-id": requestId,
        },
      });
    } catch (error) {
      const failure = error instanceof HttpError ? error : new HttpError(500, "internal_error");
      if (failure.status >= 500) log(failure.code);
      return Response.json(
        { error: { code: failure.code, message: failure.message } },
        { status: failure.status, headers: { "x-request-id": requestId } },
      );
    }
  };
}
