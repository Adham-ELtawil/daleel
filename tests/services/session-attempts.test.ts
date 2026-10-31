import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { users } from "@/src/db/schema";
import { seed } from "@/src/db/seed";
import { tempDb } from "@/tests/db/helpers";
import { diagnoseStepConfig } from "@/src/llm/prompts/diagnose";
import { ladderStepConfig } from "@/src/llm/prompts/ladder";
import { DiagnosisSchema } from "@/src/llm/schemas/diagnosis";
import { HintLadderSchema } from "@/src/llm/schemas/ladder";
import diagnosis from "@/tests/fixtures/llm/diagnosis-a.json";
import ladder from "@/tests/fixtures/llm/ladder-a.json";

let store: Awaited<ReturnType<typeof tempDb>>;
let handlers: ReturnType<typeof import("@/src/services/handlers").createHandlers>;
const secret = "pr19a-test-secret-with-at-least-32-characters";
const cookie = `daleel_session=trainee_01.${createHmac("sha256", secret).update("trainee_01").digest("base64url")}`;
const request = (signed = true, body?: object) =>
  new Request("http://localhost/api/attempts", {
    method: body ? "POST" : "GET",
    headers: { cookie: signed ? cookie : "" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("SESSION_SECRET", secret);
  store = await tempDb();
  await seed(store.db);
  await store.db.insert(users).values({
    id: "trainee_01",
    handle: "trainee_01",
    role: "student",
    locale: "en",
    isGuest: 0,
    createdAt: 0,
  });
  const { createHandlers } = await import("@/src/services/handlers");
  handlers = createHandlers({ db: async () => store.db });
});
afterEach(() => {
  store.cleanup();
  vi.unstubAllEnvs();
});
it("keeps signed-in attempt reads, status changes and history with the session user", async () => {
  const problem = (await store.db.query.problems.findMany())[0];
  const created = await handlers.attempt(
    request(true, { problemId: problem.id, code: "fixture", language: "cpp17" }),
  );
  const { attemptId } = await created.json();
  expect(created.status).toBe(200);
  expect((await handlers.getAttempt(request(), attemptId)).status).toBe(200);
  expect((await handlers.stuck(request(true, {}), attemptId)).status).toBe(200);
  expect((await handlers.solved(request(true, {}), attemptId)).status).toBe(200);
  expect(await (await handlers.history(request())).json()).toMatchObject({
    items: [{ id: attemptId, status: "solved" }],
  });
  expect((await handlers.getAttempt(request(false), attemptId)).status).toBe(404);
  expect((await handlers.solved(request(false, {}), attemptId)).status).toBe(404);
  expect(await (await handlers.history(request(false))).json()).toEqual({ items: [] });
});
it("checks session ownership before diagnosing an attempt", async () => {
  const { createDiagnoseHandler } = await import("@/src/services/diagnose-handler");
  const problem = (await store.db.query.problems.findMany())[0];
  const created = await handlers.attempt(
    request(true, { problemId: problem.id, code: "fixture", language: "cpp17" }),
  );
  const { attemptId } = await created.json();
  const llm = vi.fn(async () => DiagnosisSchema.parse(diagnosis));
  const diagnose = createDiagnoseHandler({
    db: async () => store.db,
    now: Date.now,
    config: diagnoseStepConfig({}),
    llm,
    ladder: { config: ladderStepConfig({}), llm: async () => HintLadderSchema.parse(ladder) },
  });
  const denied = await diagnose(request(false, {}), attemptId);
  await denied.text();
  expect(denied.status).toBe(404);
  expect(llm).not.toHaveBeenCalled();
  const allowed = await diagnose(request(true, {}), attemptId);
  await allowed.text();
  expect(allowed.status).toBe(200);
  expect(llm).toHaveBeenCalledOnce();
});
