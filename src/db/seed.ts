import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { count, getTableName } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import { connect, getDb, type Db } from "./client";
import { getProblemByExternalId, insertProblem } from "./repo/problems";
import { problems, teamMembers, teams, users } from "./schema";
import fixtures from "./seed-fixtures/problems.json";

export async function seed(db: Db, now = Date.now()): Promise<void> {
  await connect(db);
  for (const fixture of fixtures) {
    const problem = { ...fixture, judge: z.enum(problems.judge.enumValues).parse(fixture.judge) };
    if (!(await getProblemByExternalId(db, problem.judge, problem.externalId))) {
      await insertProblem(db, problem, now);
    }
  }

  const coachValues = { role: "coach", locale: "ar-EG", isGuest: 0 } as const;
  const coach = await db
    .insert(users)
    .values({ id: ulid(now), handle: "demo_coach", ...coachValues, createdAt: now })
    .onConflictDoUpdate({ target: users.handle, set: coachValues })
    .returning({ id: users.id })
    .get();
  const teamValues = { name: "DEMO", coachId: coach.id };
  const team = await db
    .insert(teams)
    .values({ id: ulid(now), inviteCode: "DEMO01", ...teamValues, createdAt: now })
    .onConflictDoUpdate({ target: teams.inviteCode, set: teamValues })
    .returning({ id: teams.id })
    .get();
  await db
    .insert(teamMembers)
    .values({ teamId: team.id, userId: coach.id, joinedAt: now })
    .onConflictDoNothing();
}

async function main(): Promise<void> {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const db = getDb();
  try {
    await seed(db);
    for (const table of [problems, users, teams, teamMembers]) {
      const [{ total }] = await db.select({ total: count() }).from(table);
      console.log(`${getTableName(table)}: ${total}`);
    }
  } finally {
    db.$client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
