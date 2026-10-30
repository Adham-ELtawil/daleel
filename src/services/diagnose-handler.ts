import type { Db } from "@/src/db/client";
import { ulid } from "ulid";
import { z } from "zod";
import { diagnoseAttempt, type DiagnoseDeps } from "./diagnose-service";
import { HttpError } from "./http-error";
import { serializeSse } from "./sse";

export function createDiagnoseHandler(
  deps: Omit<DiagnoseDeps, "db"> & {
    db: () => Promise<Db>;
    log?: (event: { requestId: string; code: string }) => void;
  },
) {
  return async (request: Request, id: string) => {
    const requestId = request.headers.get("x-request-id") ?? ulid();
    const log = (code: string) => (deps.log ?? console.error)({ requestId, code });
    try {
      if (!z.strictObject({}).safeParse(await request.json().catch(() => null)).success)
        throw new HttpError(400, "invalid");
      const db = await deps.db();
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
        void diagnoseAttempt({ ...deps, db }, id, (event) => {
          if (event.event === "error") log(event.data.code);
          if (!cancelled) controller.enqueue(new TextEncoder().encode(serializeSse(event)));
          resolve();
        })
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
