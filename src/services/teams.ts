import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import type { Db } from "@/src/db/client";
import { TagsSchema } from "@/src/db/json";
import { attempts, diagnoses, teams, teamMembers, users } from "@/src/db/schema";
import { weeklyStats } from "@/src/domain/weekly-stats";
import { HttpError } from "./http-error";

export const InviteSchema = z.string().regex(/^[A-Z0-9]{8}$/);
type User = typeof users.$inferSelect;
export async function createTeam(db: Db, user: User, name: string) {
  if (user.role !== "coach" || user.isGuest) throw new HttpError(403, "forbidden");
  for (let retry = 0; retry < 3; retry++) {
    const inviteCode = randomInt(36 ** 8)
      .toString(36)
      .padStart(8, "0")
      .toUpperCase();
    const team = { id: ulid(), name, inviteCode };
    const inserted = await db
      .insert(teams)
      .values({ ...team, coachId: user.id, createdAt: Date.now() })
      .onConflictDoNothing({ target: teams.inviteCode })
      .returning();
    if (inserted.length) return { team };
  }
  throw new HttpError(500, "internal_error");
}
export async function joinTeam(db: Pick<Db, "select" | "insert">, user: User, inviteCode: string) {
  if (user.role !== "student" || user.isGuest) throw new HttpError(403, "forbidden");
  const team = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.inviteCode, inviteCode))
    .get();
  if (!team) throw new HttpError(404, "not_found");
  await db
    .insert(teamMembers)
    .values({ teamId: team.id, userId: user.id, joinedAt: Date.now() })
    .onConflictDoNothing();
  return team;
}
export async function teamStats(db: Db, user: User, id: string, week: string | null) {
  if (user.role !== "coach" || user.isGuest) throw new HttpError(403, "forbidden");
  const team = await db.select().from(teams).where(eq(teams.id, id)).get();
  if (!team) throw new HttpError(404, "not_found");
  if (team.coachId !== user.id) throw new HttpError(403, "forbidden");
  const timestamp = week === null ? Date.now() : Date.parse(`${week}T12:00:00Z`);
  if (
    week !== null &&
    (!z.iso.date().safeParse(week).success || new Date(timestamp).getUTCDay() !== 1)
  )
    throw new HttpError(400, "invalid");
  const rows = await db
    .select({
      userId: users.id,
      handle: users.handle,
      createdAt: attempts.createdAt,
      mode: attempts.mode,
      status: attempts.status,
      maxHintLevel: attempts.maxHintLevel,
      topicsJson: diagnoses.topicsJson,
      bugClass: diagnoses.bugClass,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .innerJoin(attempts, eq(attempts.userId, users.id))
    .leftJoin(diagnoses, eq(diagnoses.attemptId, attempts.id))
    .where(eq(teamMembers.teamId, id));
  return {
    stats: weeklyStats(
      rows.map(({ topicsJson, ...row }) => ({
        ...row,
        topics: TagsSchema.parse(JSON.parse(topicsJson ?? "[]")),
      })),
      timestamp,
    ),
  };
}
