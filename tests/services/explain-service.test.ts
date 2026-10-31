import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { attempts, diagnoses, problems, stressRuns, users, walkthroughs } from "@/src/db/schema";
import { createHandlers } from "@/src/services/handlers";
import { markAttempt, revealHint } from "@/src/services/attempt-service";
import { ladderStepConfig } from "@/src/llm/prompts/ladder";
import { HintLadderSchema } from "@/src/llm/schemas/ladder";
import { BudgetReached } from "@/src/llm/meta-client";
import { tempDb } from "@/tests/db/helpers";
import example from "@/tests/fixtures/llm/explanation-a.json";
import ladder from "@/tests/fixtures/llm/ladder-a.json";
import rows from "@/tests/fixtures/llm/ladder-service.json";

let store: Awaited<ReturnType<typeof tempDb>>;
const id = rows.attempt.id;
async function setup() {
  const path = resolve("src/services/explain-service.ts");
  expect(existsSync(path), "Explain service behavior is missing").toBe(true);
  const service = (await import(path)) as typeof import("@/src/services/explain-service");
  const { explainStepConfig } = await import("@/src/llm/prompts/explain");
  const deps = {
    db: store.db,
    now: () => 1000,
    config: explainStepConfig({}),
    llm: vi.fn<import("@/src/services/explain-service").ExplainDeps["llm"]>(async () =>
      structuredClone(example),
    ),
  };
  const handlers = createHandlers({
    db: async () => store.db,
    explain: { config: deps.config, llm: deps.llm },
    log: vi.fn(),
  });
  return { ...service, deps, handlers };
}
const request = (body: unknown = {}) =>
  new Request("http://localhost/api/attempts/test/explain", {
    method: "POST",
    headers: { "x-request-id": "pr17-request" },
    body: JSON.stringify(body),
  });
beforeEach(async () => {
  store = await tempDb();
  await store.db
    .insert(users)
    .values({ ...rows.user, handle: "guest_local", role: "student", locale: "en" });
  await store.db.insert(problems).values({ ...rows.problem, judge: "codeforces" });
  await store.db.insert(attempts).values({
    ...rows.attempt,
    code: readFileSync("docs/examples/cf-4A-watermelon/student.cpp", "utf8"),
    maxHintLevel: 0,
    language: "cpp17",
    locale: "en",
    status: "diagnosed",
  });
  await store.db.insert(diagnoses).values(rows.diagnosis);
});
afterEach(() => store.cleanup());
it("returns 403 locked until three actual reveals even if maxHintLevel claims three", async () => {
  const { handlers, deps } = await setup();
  await store.db.update(attempts).set({ maxHintLevel: 3 }).where(eq(attempts.id, id));
  const response = await handlers.explain(request(), id);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({
    error: { code: "locked", message: expect.any(String) },
  });
  expect(response.headers.get("x-request-id")).toBe("pr17-request");
  expect(deps.llm).not.toHaveBeenCalled();
});
it("unlocks after three reveals, caches without another LLM call, validates and splits public fields", async () => {
  const { explainAttempt, handlers, deps } = await setup();
  const hintDeps = {
    db: store.db,
    now: deps.now,
    ladder: { config: ladderStepConfig({}), llm: async () => HintLadderSchema.parse(ladder) },
  };
  for (let count = 1; count <= 3; count++) {
    await revealHint(hintDeps, id);
    if (count < 3) expect((await handlers.explain(request(), id)).status).toBe(403);
  }
  await store.db
    .insert(stressRuns)
    .values({ ...rows.stress, status: "verified", expectedOutput: "NO\n", actualOutput: "YES\n" });
  const response = await handlers.explain(request(), id);
  expect(response.status).toBe(200);
  const { trace, ...explanation } = example;
  const expected = {
    explanation,
    trace: { ...trace, expected_output: "NO\n", student_output: "YES\n" },
  };
  expect(await response.json()).toEqual(expected);
  deps.llm.mockClear();
  expect(await explainAttempt(deps, id)).toEqual(expected);
  expect(deps.llm).not.toHaveBeenCalled();
  const cached = (await store.db.select().from(walkthroughs).get())!;
  expect(JSON.parse(cached.explanationJson)).toEqual(explanation);
  expect(JSON.parse(cached.traceJson)).toEqual(expected.trace);
});
it("unlocks after stuck and caches once per locale with Arabic public prose repair", async () => {
  const { explainAttempt, deps } = await setup();
  await markAttempt({ db: store.db, now: deps.now }, id, "stuck");
  const english = await explainAttempt(deps, id, "en");
  deps.llm.mockResolvedValue({
    ...example,
    explanation_md: "input كبير",
    complexity_note: "O(1) هنا",
    trace: {
      ...example.trace,
      frames: example.trace.frames.map((frame) => ({ ...frame, caption: "input هنا" })),
    },
  });
  const arabic = await explainAttempt(deps, id, "ar-EG");
  expect(arabic.explanation).toMatchObject({
    explanation_md: "الـ input كبير",
    complexity_note: "الـ O(1) هنا",
    fix: example.fix,
  });
  expect(arabic.trace.frames[0].caption).toBe("الـ input هنا");
  expect(await explainAttempt(deps, id, "ar-EG")).toEqual(arabic);
  expect(await explainAttempt(deps, id, "en")).toEqual(english);
  expect(deps.llm).toHaveBeenCalledTimes(2);
  expect(await store.db.select().from(walkthroughs)).toHaveLength(2);
});
it("rejects missing and other-user attempts, bad bodies and returns safe budget errors", async () => {
  const { handlers, deps } = await setup();
  for (const body of [{ locale: "fr" }, { extra: true }, null])
    expect((await handlers.explain(request(body), id)).status).toBe(400);
  expect((await handlers.explain(request(), "missing")).status).toBe(404);
  await markAttempt({ db: store.db, now: deps.now }, id, "stuck");
  deps.llm.mockRejectedValue(new BudgetReached(10, 10));
  const response = await handlers.explain(request(), id);
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: { code: "budget_reached" } });
  await store.db
    .insert(users)
    .values({ ...rows.user, id: "other-user", role: "student", locale: "en" });
  await store.db.update(attempts).set({ userId: "other-user" }).where(eq(attempts.id, id));
  expect((await handlers.explain(request(), id)).status).toBe(404);
});
