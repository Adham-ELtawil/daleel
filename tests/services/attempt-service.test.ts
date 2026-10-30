import { readFileSync } from "node:fs";
import { and, desc, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createDb, connect } from "@/src/db/client";
import { getProblemByExternalId } from "@/src/db/repo/problems";
import { attempts, diagnoses, hintLadders, hintReveals, stressRuns, users } from "@/src/db/schema";
import { seed } from "@/src/db/seed";
import { ladderStepConfig } from "@/src/llm/prompts/ladder";
import { HintLadderSchema } from "@/src/llm/schemas/ladder";
import { toPublic, DiagnosisSchema } from "@/src/llm/schemas/diagnosis";
import { createHandlers } from "@/src/services/handlers";
import type { LadderDeps } from "@/src/services/ladder-service";
import { tempDb } from "@/tests/db/helpers";
import fixture from "@/tests/fixtures/llm/diagnosis-a.json";
import ladderFixture from "@/tests/fixtures/llm/ladder-a.json";

const code = readFileSync("docs/examples/cf-4A-watermelon/student.cpp", "utf8");
const ladder = HintLadderSchema.parse(ladderFixture);
const publicHints = ladder.levels.map(({ level, title, body_md, question_back }) => ({
  level,
  title,
  body_md,
  question_back,
}));
const request = (body: unknown = {}) =>
  new Request("http://localhost/api", {
    method: "POST",
    headers: { "x-request-id": "pr13-test" },
    body: JSON.stringify(body),
  });
const get = (query = "") => new Request(`http://localhost/api${query}`);
let store: Awaited<ReturnType<typeof tempDb>>;
let problemId: string;
let now: number;
const setup = (db = store.db) => {
  const llm = vi.fn<LadderDeps["llm"]>(async () => ladder);
  const log = vi.fn();
  return {
    llm,
    log,
    handlers: createHandlers({
      db: async () => db,
      now: () => now,
      ladder: { llm, config: ladderStepConfig({}) },
      log,
    }),
  };
};
async function createAttempt(fields: Record<string, unknown> = {}) {
  const response = await setup().handlers.attempt(
    request({ problemId, language: "cpp17", code, ...fields }),
  );
  expect(response.status).toBe(200);
  const result: { attemptId: string } = await response.json();
  return result.attemptId;
}
async function diagnosed() {
  const id = await createAttempt();
  await store.db.insert(diagnoses).values({
    id: `diagnosis-${id}`,
    attemptId: id,
    resultJson: JSON.stringify(fixture),
    bugClass: fixture.bug_class,
    topicsJson: JSON.stringify(fixture.topics),
    confidence: fixture.confidence,
    model: "fake-model",
    reasoningEffort: "low",
    createdAt: now,
  });
  await store.db.update(attempts).set({ status: "diagnosed" }).where(eq(attempts.id, id));
  return id;
}
const row = (id: string) => store.db.select().from(attempts).where(eq(attempts.id, id)).get();
const reveals = (id: string) =>
  store.db
    .select()
    .from(hintReveals)
    .where(eq(hintReveals.attemptId, id))
    .orderBy(hintReveals.level);
beforeEach(async () => {
  vi.stubGlobal("fetch", () => {
    throw new Error("Unexpected network");
  });
  store = await tempDb();
  now = 1000;
  await seed(store.db, now);
  problemId = (await getProblemByExternalId(store.db, "codeforces", "4A"))!.id;
});
afterEach(() => {
  store.cleanup();
  vi.unstubAllGlobals();
});

it("reveals 1..4 with timestamps and maxHintLevel, then returns 409 without spending again", async () => {
  const id = await diagnosed();
  const { handlers, llm } = setup();
  for (let level = 1; level <= 4; level++) {
    now++;
    const response = await handlers.nextHint(request(), id);
    expect(response.status).toBe(200);
    const hint = publicHints[level - 1];
    expect(await response.json()).toEqual({ hint, remaining: 4 - level });
    expect((await reveals(id)).at(-1)).toEqual({ attemptId: id, level, revealedAt: now });
    expect((await row(id))?.maxHintLevel).toBe(level);
  }
  const response = await handlers.nextHint(request(), id);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "no_more_hints" } });
  expect(await reveals(id)).toHaveLength(4);
  expect(llm).toHaveBeenCalledOnce();
});
it("returns 425 before diagnosis, even if a ladder exists, without recording a reveal", async () => {
  const id = await createAttempt();
  await store.db.insert(hintLadders).values({
    id: "orphan-ladder",
    attemptId: id,
    locale: "en",
    levelsJson: JSON.stringify(ladder.levels),
    createdAt: now,
  });
  const { handlers, llm } = setup();
  const response = await handlers.nextHint(request(), id);
  expect(response.status).toBe(425);
  expect(await response.json()).toMatchObject({ error: { code: "not_diagnosed" } });
  expect(await reveals(id)).toHaveLength(0);
  expect(llm).not.toHaveBeenCalled();
});
it.each([false, true])(
  "serializes double-clicks with separate connection=%s and caps concurrent final reveals",
  async (separate) => {
    const id = await diagnosed();
    const { handlers } = setup();
    await handlers.nextHint(request(), id);
    await store.db.delete(hintReveals).where(eq(hintReveals.attemptId, id));
    await store.db.update(attempts).set({ maxHintLevel: 0 }).where(eq(attempts.id, id));
    const other = separate ? createDb({ url: store.url }) : undefined;
    try {
      if (other) await connect(other.db);
      const second = setup(other?.db).handlers;
      const responses = await Promise.all([
        handlers.nextHint(request(), id),
        second.nextHint(request(), id),
      ]);
      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      const bodies = await Promise.all(responses.map((r) => r.json()));
      expect(bodies.map((r: { hint: { level: number } }) => r.hint.level).sort()).toEqual([1, 2]);
      expect((await reveals(id)).map((r) => r.level)).toEqual([1, 2]);
      expect((await row(id))?.maxHintLevel).toBe(2);
      await handlers.nextHint(request(), id);
      const final = await Promise.all([
        handlers.nextHint(request(), id),
        second.nextHint(request(), id),
      ]);
      expect(final.map((r) => r.status).sort()).toEqual([200, 409]);
      expect((await reveals(id)).map((r) => r.level)).toEqual([1, 2, 3, 4]);
      expect((await row(id))?.maxHintLevel).toBe(4);
    } finally {
      other?.close();
    }
  },
);
it("rolls the reveal back if maxHintLevel cannot be updated and logs only a safe code", async () => {
  const id = await diagnosed();
  await store.db.run(
    sql`CREATE TRIGGER reject_hint_update BEFORE UPDATE OF max_hint_level ON attempts BEGIN SELECT RAISE(ABORT, 'private db detail'); END`,
  );
  const { handlers, log } = setup();
  const response = await handlers.nextHint(request(), id);
  expect(response.status).toBe(500);
  expect(await response.json()).toMatchObject({ error: { code: "internal_error" } });
  expect(log).toHaveBeenCalledWith({ requestId: "pr13-test", code: "internal_error" });
  expect(await reveals(id)).toHaveLength(0);
  expect((await row(id))?.maxHintLevel).toBe(0);
});
it("returns the persisted ladder when concurrent lazy generation produces different text", async () => {
  const id = await diagnosed();
  const { handlers, llm } = setup();
  let calls = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  llm.mockImplementation(async () => {
    const generation = ++calls;
    if (calls === 2) release();
    await ready;
    return {
      levels: ladder.levels.map((hint) => ({
        ...hint,
        title: `Generation ${generation} hint ${hint.level}`,
      })),
    };
  });
  const responses = await Promise.all([
    handlers.nextHint(request(), id),
    handlers.nextHint(request(), id),
  ]);
  expect(responses.map((response) => response.status)).toEqual([200, 200]);
  const saved = (await store.db.select().from(hintLadders).get())!;
  const persisted = HintLadderSchema.parse({ levels: JSON.parse(saved.levelsJson) });
  for (const response of responses) {
    const { hint }: { hint: { level: number; title: string } } = await response.json();
    expect(hint.title).toBe(persisted.levels[hint.level - 1].title);
  }
  expect((await reveals(id)).map((reveal) => reveal.level)).toEqual([1, 2]);
});
it("persists public diagnosis and revealed hints on GET and unlocks explanation only at level 3 or stuck", async () => {
  const id = await diagnosed();
  await store.db.insert(stressRuns).values({
    id: "stress",
    attemptId: id,
    status: "skipped",
    runner: "none",
    bruteCode: "private brute",
    testsJson: "[]",
    createdAt: now,
  });
  const { handlers } = setup();
  for (let count = 0; count <= 4; count++) {
    if (count) await handlers.nextHint(request(), id);
    const response = await setup().handlers.getAttempt(get(), id);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      attempt: { id, code, maxHintLevel: count },
      problem: { title: "Watermelon" },
      diagnosis: toPublic(DiagnosisSchema.parse(fixture)),
      revealedHints: publicHints.slice(0, count),
      canExplain: count >= 3,
    });
    const text = await (await handlers.getAttempt(get(), id)).text();
    for (const hidden of [
      "_internal",
      "brute_code",
      "private brute",
      "resultJson",
      "codeHash",
      "diagnosingSince",
      "userId",
    ])
      expect(text).not.toContain(hidden);
  }
  const fresh = await createAttempt();
  expect(await (await handlers.getAttempt(get(), fresh)).json()).toMatchObject({
    revealedHints: [],
    canExplain: false,
  });
  expect(await (await handlers.stuck(request(), fresh)).json()).toEqual({ canExplain: true });
  expect((await row(fresh))?.status).toBe("stuck");
  expect(await (await handlers.getAttempt(get(), fresh)).json()).toMatchObject({
    canExplain: true,
  });
  now = 2000;
  expect(await (await handlers.solved(request(), fresh)).json()).toEqual({ ok: true });
  expect(await row(fresh)).toMatchObject({ status: "solved", solvedAt: now, maxHintLevel: 0 });
  expect(await (await handlers.getAttempt(get(), fresh)).json()).toMatchObject({
    canExplain: false,
  });
});
it("caches each locale once and translates already revealed hints without changing their count", async () => {
  const id = await diagnosed();
  const { handlers, llm } = setup();
  await handlers.nextHint(request(), id);
  const arabic = {
    levels: ladder.levels.map((hint) => ({ ...hint, title: `تلميح ${hint.level}` })),
  };
  llm.mockResolvedValue(arabic);
  expect(await (await handlers.nextHint(request({ locale: "ar-EG" }), id)).json()).toMatchObject({
    hint: { level: 2, title: "تلميح 2" },
    remaining: 2,
  });
  for (let n = 0; n < 2; n++) {
    expect(await (await handlers.getAttempt(get("?locale=ar-EG"), id)).json()).toMatchObject({
      revealedHints: [{ title: "تلميح 1" }, { title: "تلميح 2" }],
    });
  }
  expect(llm).toHaveBeenCalledTimes(2);
  expect(await reveals(id)).toHaveLength(2);
  expect((await row(id))?.maxHintLevel).toBe(2);
});
it("links a re-check child and rejects missing or different-problem parents with 400", async () => {
  const parent = await createAttempt();
  const child = await createAttempt({ parentAttemptId: parent, code: "fixed code" });
  expect(await row(child)).toMatchObject({
    parentAttemptId: parent,
    problemId,
    code: "fixed code",
    status: "new",
  });
  const other = (await getProblemByExternalId(store.db, "codeforces", "1A"))!.id;
  const { handlers } = setup();
  for (const fields of [
    { parentAttemptId: "missing" },
    { parentAttemptId: parent, problemId: other },
  ]) {
    const response = await handlers.attempt(
      request({ problemId, code, language: "cpp17", ...fields }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid" } });
  }
  expect(await store.db.select().from(attempts)).toHaveLength(2);
});
it("paginates local guest history by createdAt + id newest first without leaking other users", async () => {
  const id = await createAttempt();
  const base = (await row(id))!;
  await store.db.delete(attempts).where(eq(attempts.id, id));
  const ids = Array.from({ length: 43 }, (_, n) => `history-${String(n).padStart(2, "0")}`);
  await store.db.insert(attempts).values(
    ids.map((id, n) => ({
      ...base,
      id,
      createdAt: 1000 + Math.floor(n / 3),
      status: n % 2 ? ("solved" as const) : ("stuck" as const),
      maxHintLevel: n % 5,
    })),
  );
  await store.db.insert(users).values({
    id: "other-user",
    handle: "other_handle",
    locale: "en",
    role: "student",
    isGuest: 1,
    createdAt: 1,
  });
  await store.db
    .insert(attempts)
    .values({ ...base, id: "other-attempt", userId: "other-user", createdAt: 99999 });
  const { handlers } = setup();
  let cursor: string | undefined;
  const seen: string[] = [];
  for (const size of [20, 20, 3]) {
    const response = await handlers.history(
      get(cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""),
    );
    expect(response.status).toBe(200);
    const page: {
      items: {
        id: string;
        problemTitle: string;
        status: string;
        maxHintLevel: number;
        createdAt: number;
      }[];
      nextCursor?: string;
    } = await response.json();
    expect(page.items).toHaveLength(size);
    for (const item of page.items) {
      expect(Object.keys(item).sort()).toEqual([
        "createdAt",
        "id",
        "maxHintLevel",
        "problemTitle",
        "status",
      ]);
      expect(item.problemTitle).toBe("Watermelon");
    }
    seen.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor;
    expect(Boolean(cursor)).toBe(size === 20);
  }
  const expected = await store.db
    .select({ id: attempts.id })
    .from(attempts)
    .where(eq(attempts.userId, base.userId))
    .orderBy(desc(attempts.createdAt), desc(attempts.id));
  expect(seen).toEqual(expected.map((r) => r.id));
  expect((await handlers.history(get("?cursor=garbage"))).status).toBe(400);
});
it("returns safe 404 for missing or other-user attempts and validates all mutation bodies", async () => {
  const id = await createAttempt();
  await store.db.insert(users).values({
    id: "other-user",
    handle: "other_handle",
    locale: "en",
    role: "student",
    isGuest: 1,
    createdAt: 1,
  });
  await store.db.update(attempts).set({ userId: "other-user" }).where(eq(attempts.id, id));
  const { handlers } = setup();
  for (const hiddenId of ["missing", id]) {
    for (const handler of [
      handlers.nextHint,
      handlers.stuck,
      handlers.solved,
      handlers.getAttempt,
    ]) {
      const response = await handler(request(), hiddenId);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: { code: "not_found" } });
    }
  }
  const own = await createAttempt();
  for (const handler of [handlers.nextHint, handlers.stuck, handlers.solved])
    expect((await handler(request({ extra: true }), own)).status).toBe(400);
  expect((await handlers.nextHint(request({ locale: "fr" }), own)).status).toBe(400);
  expect(
    (
      await store.db
        .select()
        .from(attempts)
        .where(and(eq(attempts.id, own), eq(attempts.status, "new")))
    ).length,
  ).toBe(1);
});
