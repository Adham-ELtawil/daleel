import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { count, getTableName, inArray } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import { connect, getDb, type Db } from "./client";
import { getProblemByExternalId, insertProblem } from "./repo/problems";
import { attempts, diagnoses, problems, teamMembers, teams, users } from "./schema";
import { seedDemoTeam } from "./seed-demo-team";
import fixtures from "./seed-fixtures/problems.json";

export async function seed(db: Db, now = Date.now(), demoTeam = false): Promise<void> {
  await connect(db);
  for (const fixture of fixtures) {
    const problem = { ...fixture, judge: z.enum(problems.judge.enumValues).parse(fixture.judge) };
    if (!(await getProblemByExternalId(db, problem.judge, problem.externalId))) {
      await insertProblem(db, problem, now);
    }
  }

  const existing = await db
    .select()
    .from(teams)
    .where(inArray(teams.inviteCode, ["DEMO01", "DEMO0001"]))
    .get();
  const populated = demoTeam || existing?.inviteCode === "DEMO0001";
  const handle = populated ? "coach_demo" : "demo_coach";
  const coachValues = { role: "coach", locale: "ar-EG", isGuest: 0 } as const;
  const coach = await db
    .insert(users)
    .values({ id: populated ? handle : ulid(now), handle, ...coachValues, createdAt: now })
    .onConflictDoUpdate({ target: users.handle, set: coachValues })
    .returning({ id: users.id })
    .get();
  const teamValues = {
    name: "DEMO",
    coachId: coach.id,
    inviteCode: populated ? "DEMO0001" : "DEMO01",
  };
  const team = await db
    .insert(teams)
    .values({
      id: existing?.id ?? (populated ? "demo_team" : ulid(now)),
      ...teamValues,
      createdAt: now,
    })
    .onConflictDoUpdate({ target: teams.id, set: teamValues })
    .returning({ id: teams.id })
    .get();
  await db
    .insert(teamMembers)
    .values({ teamId: team.id, userId: coach.id, joinedAt: now })
    .onConflictDoNothing();
  if (demoTeam) await seedDemoTeam(db, team.id, now);
}

async function main(): Promise<void> {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const db = getDb();
  try {
    await seed(db, Date.now(), process.argv.includes("--demo-team"));
    for (const table of [problems, users, teams, teamMembers, attempts, diagnoses]) {
      const [{ total }] = await db.select({ total: count() }).from(table);
      console.log(`${getTableName(table)}: ${total}`);
    }
  } finally {
    db.$client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
