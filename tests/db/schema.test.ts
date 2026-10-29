import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/src/db/client";
import { teamMembers } from "@/src/db/schema";
import { tempDb } from "./helpers";

let db: Db;
let cleanup: () => void;
beforeEach(async () => ({ db, cleanup } = await tempDb()));
afterEach(() => cleanup());

describe("migrations", () => {
  it("create every table from docs/03-ARCHITECTURE.md §3", async () => {
    const rows = await db.all<{ name: string }>(
      sql`select name from sqlite_master where type = 'table' and name not glob '__*' and name not glob 'sqlite_*' order by name`,
    );
    expect(rows.map((r) => r.name)).toEqual([
      "attempts",
      "diagnoses",
      "hint_ladders",
      "hint_reveals",
      "llm_calls",
      "problems",
      "stress_runs",
      "team_members",
      "teams",
      "users",
      "walkthroughs",
      "weekly_reports",
    ]);
  });

  it("create the documented indexes", async () => {
    const rows = await db.all<{ tbl_name: string; sql: string | null }>(
      sql`select tbl_name, sql from sqlite_master where type = 'index' and sql is not null`,
    );
    const ddl = rows.map((r) => r.sql ?? "").join("\n");
    expect(ddl).toMatch(/ON `attempts` \(`user_id`,`created_at`\)/);
    expect(ddl).toMatch(/ON `attempts` \(`problem_id`,`code_hash`,`locale`\)/);
    expect(ddl).toMatch(/ON `llm_calls` \(`created_at`\)/);
    expect(ddl).toMatch(/ON `team_members` \(`user_id`\)/);
  });

  it("enforce foreign keys", async () => {
    await expect(
      db.insert(teamMembers).values({ teamId: "no-team", userId: "no-user", joinedAt: 1 }),
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/FOREIGN KEY/) } });
  });

  it("enforces foreign keys inside db.transaction", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(teamMembers).values({ teamId: "no-team", userId: "no-user", joinedAt: 1 });
      }),
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/FOREIGN KEY/) } });
    expect(await db.select().from(teamMembers)).toHaveLength(0);
  });
});
