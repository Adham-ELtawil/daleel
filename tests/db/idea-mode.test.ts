import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { expect, it } from "vitest";
import { createDb } from "@/src/db/client";
import { migrateDb } from "@/src/db/migrate";
import journal from "@/src/db/migrations/meta/_journal.json";

it("migration 0002 gives legacy attempts a non-null code mode without changing their code", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pr26-migration-"));
  const { db, close } = createDb({ url: `file:${join(dir, "legacy.db")}` });
  try {
    const folder = join(dir, "migrations");
    mkdirSync(join(folder, "meta"), { recursive: true });
    for (const entry of journal.entries.slice(0, 2))
      copyFileSync(`src/db/migrations/${entry.tag}.sql`, join(folder, `${entry.tag}.sql`));
    writeFileSync(
      join(folder, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 2) }),
    );
    await migrate(db, { migrationsFolder: folder });
    await db.run(
      sql`INSERT INTO users (id, handle, role, locale, is_guest, created_at) VALUES ('legacy', 'legacy_handle', 'student', 'en', 1, 0)`,
    );
    await db.run(
      sql`INSERT INTO problems (id, judge, external_id, title, statement_md, input_spec_md, output_spec_md, samples_json, time_limit_ms, memory_limit_mb, tags_json, content_hash, fetched_at) VALUES ('legacy', 'custom', 'legacy', 'fixture', 'fixture', '', '', '[]', 1000, 64, '[]', 'hash', 0)`,
    );
    await db.run(
      sql`INSERT INTO attempts (id, user_id, problem_id, language, code, code_hash, locale, status, created_at) VALUES ('legacy', 'legacy', 'legacy', 'cpp17', 'legacy code', 'hash', 'en', 'new', 0)`,
    );
    await migrateDb(db);
    const columns = await db.all<{ name: string; notnull: number; dflt_value: string | null }>(
      sql`PRAGMA table_info(attempts)`,
    );
    expect(columns.find(({ name }) => name === "mode")).toMatchObject({
      notnull: 1,
      dflt_value: "'code'",
    });
    expect(await db.all(sql`SELECT mode, code FROM attempts`)).toEqual([
      { mode: "code", code: "legacy code" },
    ]);
  } finally {
    close();
    rmSync(dir, { recursive: true, force: true });
  }
});
