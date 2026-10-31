import { eq } from "drizzle-orm";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it } from "vitest";
import { seed } from "@/src/db/seed";
import { attempts, diagnoses, problems, teamMembers, teams, users } from "@/src/db/schema";
import { DiagnosisSchema } from "@/src/llm/schemas/diagnosis";
import { weeklyStats } from "@/src/domain/weekly-stats";
import { startSession } from "@/src/services/session";
import { teamStats } from "@/src/services/teams";
import cf from "@/tests/fixtures/cf-api/problemset.problems.json";
import { tempDb } from "./helpers";

let store: Awaited<ReturnType<typeof tempDb>>;
const now = Date.parse("2026-10-31T12:00:00Z");
beforeEach(async () => {
  store = await tempDb();
});
afterEach(() => store.cleanup());

async function snapshot() {
  return {
    users: await store.db.select().from(users).orderBy(users.id),
    teams: await store.db.select().from(teams).orderBy(teams.id),
    members: await store.db.select().from(teamMembers).orderBy(teamMembers.userId),
    attempts: await store.db.select().from(attempts).orderBy(attempts.id),
    diagnoses: await store.db.select().from(diagnoses).orderBy(diagnoses.id),
  };
}

it("seeds exactly 20 trainees and 120 diagnosed CF attempts, deterministically and idempotently", async () => {
  await seed(store.db, now, true);
  const first = await snapshot();
  expect(
    first.users
      .filter((user) => user.role === "student")
      .map((user) => user.handle)
      .sort(),
  ).toEqual(Array.from({ length: 20 }, (_, n) => `trainee_${String(n + 1).padStart(2, "0")}`));
  expect(first.attempts).toHaveLength(120);
  expect(first.diagnoses).toHaveLength(120);
  expect(first.teams).toHaveLength(1);
  expect(first.teams[0]).toMatchObject({
    name: "DEMO",
    inviteCode: expect.stringMatching(/^[A-Z0-9]{8}$/),
  });
  const coach = first.users.find((user) => user.id === first.teams[0].coachId)!;
  expect(coach).toMatchObject({ handle: "coach_demo", role: "coach", isGuest: 0 });
  const members = new Set(first.members.map((member) => member.userId));
  const cfIds = new Set(
    cf.result.problems.map((problem) => `${problem.contestId}${problem.index}`),
  );
  const storedProblems = await store.db.select().from(problems);
  for (const attempt of first.attempts) {
    expect(members.has(attempt.userId)).toBe(true);
    const problem = storedProblems.find((item) => item.id === attempt.problemId)!;
    expect(problem.judge).toBe("codeforces");
    expect(cfIds.has(problem.externalId)).toBe(true);
    expect(attempt.createdAt).toBeLessThanOrEqual(now);
    if (attempt.status === "solved")
      expect(attempt.solvedAt).toBeGreaterThanOrEqual(attempt.createdAt);
    else expect(attempt.solvedAt).toBeNull();
    const diagnosis = first.diagnoses.find((item) => item.attemptId === attempt.id)!;
    const result = DiagnosisSchema.parse(JSON.parse(diagnosis.resultJson));
    expect(result.topics).toEqual(JSON.parse(diagnosis.topicsJson));
    expect(result.bug_class).toBe(diagnosis.bugClass);
    expect(diagnosis.model).toBe("synthetic-demo");
  }
  for (const week of ["2026-10-26", "2026-10-19"]) {
    const { stats } = await teamStats(store.db, coach, first.teams[0].id, week);
    expect(stats).toMatchObject({ weekStart: week, attempts: 60 });
    expect(stats.trainees).toHaveLength(20);
    expect(stats.attention.length).toBeGreaterThan(0);
    expect(stats.solved).toBeGreaterThan(0);
    expect(stats.solved).toBeLessThan(60);
    expect(stats.topTags.length).toBeGreaterThan(0);
  }
  await seed(store.db, now, true);
  expect(await snapshot()).toEqual(first);
  const fresh = await tempDb();
  try {
    await seed(fresh.db, now, true);
    // Base problem IDs are allocated by the existing problem repository.
    const normalize = (rows: typeof first.attempts) =>
      rows.map((row) => ({ ...row, problemId: "" }));
    const repeated = await fresh.db.select().from(attempts).orderBy(attempts.id);
    expect(normalize(repeated)).toEqual(normalize(first.attempts));
  } finally {
    fresh.cleanup();
  }
});

it("upgrades the legacy DEMO in place, resumes coach_demo, and never duplicates or downgrades it", async () => {
  await seed(store.db, now);
  const [legacy] = await store.db.select().from(teams);
  await startSession(store.db, { handle: "coach_demo", role: "coach" });
  await seed(store.db, now, true);
  const upgraded = await snapshot();
  expect(upgraded.teams).toHaveLength(1);
  expect(upgraded.teams[0].id).toBe(legacy.id);
  expect(upgraded.attempts).toHaveLength(120);
  await seed(store.db, now + 1000);
  expect(await snapshot()).toEqual(upgraded);
  const response = await startSession(store.db, { handle: "coach_demo", role: "coach" });
  const data = await response.json();
  expect(data.user.id).toBe(upgraded.teams[0].coachId);
});

it("supports the actual pnpm db:seed --demo-team command twice against a local database", async () => {
  for (let run = 0; run < 2; run++) {
    await promisify(execFile)("pnpm", ["db:seed", "--demo-team"], {
      env: {
        NODE_ENV: "test",
        PATH: process.env.PATH,
        DATABASE_URL: store.url,
        COREPACK_HOME: process.env.COREPACK_HOME,
        COREPACK_ENABLE_NETWORK: "0",
      },
    });
    expect(await store.db.select().from(attempts)).toHaveLength(120);
    expect(await store.db.select().from(diagnoses)).toHaveLength(120);
  }
  expect(await store.db.select().from(attempts)).toHaveLength(120);
  expect(await store.db.select().from(users).where(eq(users.role, "student"))).toHaveLength(20);
}, 20000);

it.each([
  ["2026-04-26T21:00:00Z", "2026-04-27", "2026-04-20"],
  ["2026-11-01T22:00:00Z", "2026-11-02", "2026-10-26"],
])(
  "keeps 60 attempts in each Cairo week at %s, including DST and reseeding next week",
  async (instant, current, previous) => {
    const timestamp = Date.parse(instant);
    await seed(store.db, timestamp - 7 * 86400000, true);
    await seed(store.db, timestamp, true);
    const rows = await store.db.select().from(attempts);
    expect(rows).toHaveLength(120);
    expect(rows.every((row) => row.createdAt <= timestamp)).toBe(true);
    const weeks = rows.map((row) => weeklyStats([], row.createdAt).weekStart);
    expect(weeks.filter((week) => week === current)).toHaveLength(60);
    expect(weeks.filter((week) => week === previous)).toHaveLength(60);
    expect(await store.db.select().from(users).where(eq(users.role, "student"))).toHaveLength(20);
  },
);
