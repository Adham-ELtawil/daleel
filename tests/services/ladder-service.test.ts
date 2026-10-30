import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { attempts, diagnoses, hintLadders, problems, stressRuns, users } from "@/src/db/schema";
import { StoredLadderSchema } from "@/src/db/json";
import { ladderStepConfig } from "@/src/llm/prompts/ladder";
import { HintLadderSchema } from "@/src/llm/schemas/ladder";
import { ensureLadder, type LadderDeps } from "@/src/services/ladder-service";
import { tempDb } from "@/tests/db/helpers";
import example from "@/tests/fixtures/llm/ladder-a.json";
import diagnosis from "@/tests/fixtures/llm/diagnosis-a.json";
import rows from "@/tests/fixtures/llm/ladder-service.json";

let store: Awaited<ReturnType<typeof tempDb>>;
const id = "pr12-attempt";
const good = () => HintLadderSchema.parse(example);
const deps = () => ({
  db: store.db,
  now: () => 1000,
  config: ladderStepConfig({}),
  llm: vi.fn<LadderDeps["llm"]>(async () => good()),
});
const diagnose = () => store.db.insert(diagnoses).values(rows.diagnosis);
beforeEach(async () => {
  store = await tempDb();
  await store.db.insert(users).values({ ...rows.user, role: "student", locale: "en" });
  await store.db.insert(problems).values({ ...rows.problem, judge: "codeforces" });
  await store.db
    .insert(attempts)
    .values({ ...rows.attempt, language: "cpp17", locale: "en", status: "new" });
});
afterEach(() => store.cleanup());
it("returns the cached ladder without a diagnosis or any LLM calls", async () => {
  await store.db.insert(hintLadders).values({
    id: "cached",
    attemptId: id,
    locale: "en",
    levelsJson: JSON.stringify(example.levels),
    createdAt: 1,
  });
  const d = deps();
  expect(await ensureLadder(d, id, "en")).toEqual({ ...good(), replay: false, recordedAt: null });
  expect(d.llm).not.toHaveBeenCalled();
});
it("requires a stored diagnosis with 409 not_diagnosed", async () => {
  const d = deps();
  await expect(ensureLadder(d, id, "en")).rejects.toMatchObject({
    status: 409,
    code: "not_diagnosed",
  });
  expect(d.llm).not.toHaveBeenCalled();
});
it("regenerates once then falls back, stores the result and exposes no internal fields", async () => {
  await diagnose();
  const d = deps();
  const bad = good();
  bad.levels[1].body_md = "```spoiler```";
  d.llm.mockResolvedValue(bad);
  const result = await ensureLadder(d, id, "en");
  expect(d.llm).toHaveBeenCalledTimes(2);
  expect(result.levels[1].body_md).not.toBe(bad.levels[1].body_md);
  expect(result.levels[0]).toEqual(bad.levels[0]);
  const row = (await store.db.select().from(hintLadders).get())!;
  expect(StoredLadderSchema.parse(JSON.parse(row.levelsJson))).toEqual({
    value: { levels: result.levels },
    recordedAt: null,
  });
  expect(row.createdAt).toBe(1000);
  for (const secret of ["root_cause_internal", "fix_internal", "checked_internal", "brute_code"])
    expect(JSON.stringify(result)).not.toContain(secret);
  expect(await ensureLadder(d, id, "en")).toEqual(result);
  expect(d.llm).toHaveBeenCalledTimes(2);
});
it("accepts a clean regeneration, sends only verified runner fields, and caches per locale", async () => {
  await diagnose();
  await store.db.insert(stressRuns).values({ ...rows.stress, status: "verified" });
  const d = deps();
  const bad = good();
  bad.levels[0].body_md = diagnosis.fix_internal;
  d.llm.mockResolvedValueOnce(bad);
  expect(await ensureLadder(d, id, "en")).toEqual({ ...good(), replay: false, recordedAt: null });
  expect(d.llm).toHaveBeenCalledTimes(2);
  expect(d.llm.mock.calls[0][2]).toMatchObject({
    attemptId: id,
    cacheKey: expect.stringMatching(/^problem:/),
  });
  const prompt = JSON.stringify(d.llm.mock.calls[0][1]);
  expect(prompt).toContain("root_cause_internal");
  expect(prompt).toContain("verified");
  expect(prompt).not.toContain("private brute");
  await ensureLadder(d, id, "ar-EG");
  expect(d.llm).toHaveBeenCalledTimes(3);
  expect(await store.db.select().from(hintLadders)).toHaveLength(2);
  expect(
    (await store.db.select().from(attempts).where(eq(attempts.id, id)).get())?.maxHintLevel,
  ).toBe(2);
});
