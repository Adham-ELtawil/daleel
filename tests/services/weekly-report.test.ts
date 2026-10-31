import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { seed } from "@/src/db/seed";
import { attempts, problems, teams, users } from "@/src/db/schema";
import { insertProblem } from "@/src/db/repo/problems";
import { teamStats } from "@/src/services/teams";
import { tempDb } from "@/tests/db/helpers";
import cf from "@/tests/fixtures/cf-api/problemset.problems.json";
import base from "@/src/db/seed-fixtures/problems.json";

let store: Awaited<ReturnType<typeof tempDb>>;
const now = Date.parse("2026-10-31T12:00:00Z");
beforeEach(async () => {
  store = await tempDb();
  await seed(store.db, now, true);
});
afterEach(() => {
  store.cleanup();
  vi.restoreAllMocks();
});
async function setup() {
  const file = resolve("src/services/weekly-report.ts");
  expect(existsSync(file), "The weekly report service is missing").toBe(true);
  const { weeklyReport }: typeof import("@/src/services/weekly-report") = await import(file);
  const coach = (await store.db.select().from(users).where(eq(users.handle, "coach_demo")).get())!;
  const team = (await store.db.select().from(teams).where(eq(teams.coachId, coach.id)).get())!;
  return { weeklyReport, coach, team };
}

it("snapshots a deterministic DEMO report with five real fixture problems, reused stats and no HTTP", async () => {
  const { weeklyReport, coach, team } = await setup();
  const network = vi.spyOn(globalThis, "fetch");
  const first = await weeklyReport(store.db, coach, team.id, "2026-10-26", "en");
  expect(first.stats).toEqual((await teamStats(store.db, coach, team.id, "2026-10-26")).stats);
  expect(first.stats).toMatchObject({ attempts: 60, solved: 36, solvedRate: 0.6 });
  expect(first.report.attention).toHaveLength(8);
  expect(first.report.recommended).toHaveLength(5);
  expect(first.report.recommended.map((p) => p.problem_id)).not.toEqual(
    expect.arrayContaining(["1A", "4A"]),
  );
  const ids = new Set(cf.result.problems.map((p) => `${p.contestId}${p.index}`));
  for (const recommendation of first.report.recommended)
    expect(ids.has(recommendation.problem_id)).toBe(true);
  expect(first.report).toMatchSnapshot();
  expect(await weeklyReport(store.db, coach, team.id, "2026-10-26", "en")).toEqual(first);
  const secondStore = await tempDb();
  try {
    await seed(secondStore.db, now, true);
    expect((await weeklyReport(secondStore.db, coach, team.id, "2026-10-26", "en")).report).toEqual(
      first.report,
    );
  } finally {
    secondStore.cleanup();
  }
  expect(network).not.toHaveBeenCalled();
  expect(JSON.stringify(first)).not.toMatch(
    /codeHash|root_cause_internal|resultJson|student.cpp|brute_code/,
  );
});

it("excludes previous-week attempts by any member, while outsider attempts do not affect recommendations", async () => {
  const { weeklyReport, coach, team } = await setup();
  const first = await weeklyReport(store.db, coach, team.id, "2026-10-26", "en");
  expect(first.report.recommended).toHaveLength(5);
  const candidate = first.candidates.find((p) => p.id === first.report.recommended[0].problem_id)!;
  const problem = await insertProblem(
    store.db,
    {
      ...base[0],
      judge: "codeforces",
      externalId: candidate.id,
      contestId: String(candidate.contestId),
      title: candidate.name,
      rating: candidate.rating,
      tags: candidate.tags,
      url: `https://codeforces.com/problemset/problem/${candidate.contestId}/${candidate.index}`,
    },
    now,
  );
  await store.db.insert(users).values({
    id: "outsider",
    handle: "outsider",
    role: "student",
    locale: "en",
    isGuest: 0,
    createdAt: 0,
  });
  const attempt = {
    id: "old_attempt",
    userId: "outsider",
    problemId: problem.id,
    language: "cpp17" as const,
    locale: "en" as const,
    code: "private fixture",
    codeHash: "fixture",
    status: "new" as const,
    createdAt: Date.parse("2026-10-19T12:00:00Z"),
  };
  await store.db.insert(attempts).values(attempt);
  expect((await weeklyReport(store.db, coach, team.id, "2026-10-26", "en")).report).toEqual(
    first.report,
  );
  await store.db.update(attempts).set({ userId: "trainee_20" }).where(eq(attempts.id, attempt.id));
  const updated = await weeklyReport(store.db, coach, team.id, "2026-10-26", "en");
  expect(updated.report.recommended.map((p) => p.problem_id)).not.toContain(candidate.id);
  expect(updated.stats).toEqual(first.stats);
});

it("uses the selected week's stats and handles an empty week without inventing recommendations", async () => {
  const { weeklyReport, coach, team } = await setup();
  const previous = await weeklyReport(store.db, coach, team.id, "2026-10-19", "ar-EG");
  expect(previous.stats).toMatchObject({ weekStart: "2026-10-19", attempts: 60 });
  expect(previous.report.headline).toMatch(/^[\u0600-\u06ff]/);
  const empty = await weeklyReport(store.db, coach, team.id, "2026-10-12", "en");
  expect(empty.stats.attempts).toBe(0);
  expect(empty.report.recommended).toEqual([]);
  expect(empty.report.attention).toEqual([]);
  expect(empty.report.session_plan).toHaveLength(3);
});

it("derives the rating band from stored CF solves and falls back for unrated solves", async () => {
  const { weeklyReport, coach, team } = await setup();
  await store.db.update(problems).set({ rating: 2000 }).where(eq(problems.judge, "codeforces"));
  expect(
    (await weeklyReport(store.db, coach, team.id, "2026-10-26", "en")).report.recommended,
  ).toEqual([]);
  await store.db.update(problems).set({ rating: null }).where(eq(problems.judge, "codeforces"));
  const fallback = await weeklyReport(store.db, coach, team.id, "2026-10-26", "en");
  expect(fallback.candidates.map((p) => p.id)).toContain("1352C");
});

it("enforces coach ownership, guest restrictions and valid Cairo Mondays in the service", async () => {
  const { weeklyReport, coach, team } = await setup();
  for (const user of [
    { ...coach, role: "student" as const },
    { ...coach, isGuest: 1 },
    { ...coach, id: "coach_other" },
  ]) {
    await expect(weeklyReport(store.db, user, team.id, "2026-10-26", "en")).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    });
  }
  await expect(weeklyReport(store.db, coach, "missing", "2026-10-26", "en")).rejects.toMatchObject({
    status: 404,
  });
  for (const week of ["bad", "2026-10-27", "2026-02-30"]) {
    await expect(weeklyReport(store.db, coach, team.id, week, "en")).rejects.toMatchObject({
      status: 400,
    });
  }
});
