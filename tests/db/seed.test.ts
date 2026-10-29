import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/src/db/client";
import { getProblemByExternalId } from "@/src/db/repo/problems";
import { problems, teamMembers, teams, users } from "@/src/db/schema";
import { seed } from "@/src/db/seed";
import { tempDb } from "./helpers";

let db: Db;
let cleanup: () => void;
beforeEach(async () => ({ db, cleanup } = await tempDb()));
afterEach(() => cleanup());

describe("db seed", () => {
  it("inserts the 3 demo problems with their samples", async () => {
    await seed(db, 1_000);
    const all = await db.select().from(problems);
    expect(all.map((p) => `${p.judge}:${p.externalId}`).sort()).toEqual([
      "atcoder:abc300_a",
      "codeforces:1A",
      "codeforces:4A",
    ]);
    expect((await getProblemByExternalId(db, "codeforces", "4A"))?.samples).toEqual([
      { input: "8\n", output: "YES\n" },
    ]);
    expect((await getProblemByExternalId(db, "codeforces", "1A"))?.samples).toEqual([
      { input: "6 6 4\n", output: "4\n" },
    ]);
    expect((await getProblemByExternalId(db, "atcoder", "abc300_a"))?.samples).toHaveLength(3);
  });

  it("creates team DEMO owned by a coach handle (no real names)", async () => {
    await seed(db, 1_000);
    const [team] = await db.select().from(teams).where(eq(teams.name, "DEMO"));
    expect(team.inviteCode).toMatch(/^[A-Z0-9]{6}$/);
    const [coach] = await db.select().from(users).where(eq(users.id, team.coachId));
    expect(coach).toMatchObject({ handle: "demo_coach", role: "coach", isGuest: 0 });
    const members = await db.select().from(teamMembers).where(eq(teamMembers.teamId, team.id));
    expect(members.map((m) => m.userId)).toContain(coach.id);
  });

  it("is idempotent", async () => {
    await seed(db, 1_000);
    await seed(db, 2_000);
    expect(await db.select().from(problems)).toHaveLength(3);
    expect(await db.select().from(teams)).toHaveLength(1);
    expect(await db.select().from(users)).toHaveLength(1);
  });
});
