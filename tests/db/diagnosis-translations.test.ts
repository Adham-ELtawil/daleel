import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { expect, it } from "vitest";
import { createDb } from "@/src/db/client";
import { migrateDb } from "@/src/db/migrate";
import journal from "@/src/db/migrations/meta/_journal.json";

it("upgrades the 0002 database with a per-locale diagnosis cache and keeps legacy attempts", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pr29-migration-"));
  const { db, close } = createDb({ url: `file:${join(dir, "legacy.db")}` });
  try {
    const folder = join(dir, "migrations");
    mkdirSync(join(folder, "meta"), { recursive: true });
    for (const entry of journal.entries.slice(0, 3))
      copyFileSync(`src/db/migrations/${entry.tag}.sql`, join(folder, `${entry.tag}.sql`));
    writeFileSync(
      join(folder, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 3) }),
    );
    await migrate(db, { migrationsFolder: folder });
    await db.run(
      sql`INSERT INTO users (id, handle, role, locale, is_guest, created_at) VALUES ('legacy', 'legacy_handle', 'student', 'en', 1, 0)`,
    );
    await db.run(
      sql`INSERT INTO problems (id, judge, external_id, title, statement_md, input_spec_md, output_spec_md, samples_json, time_limit_ms, memory_limit_mb, tags_json, content_hash, fetched_at) VALUES ('legacy', 'custom', 'legacy', 'fixture', 'fixture', '', '', '[]', 1000, 64, '[]', 'hash', 0)`,
    );
    await db.run(
      sql`INSERT INTO attempts (id, user_id, problem_id, language, code, code_hash, locale, status, created_at) VALUES ('legacy', 'legacy', 'legacy', 'cpp17', 'legacy code', 'hash', 'en', 'diagnosed', 0)`,
    );
    await migrateDb(db);
    const columns = await db.all<{ name: string; notnull: number }>(
      sql`PRAGMA table_info(diagnosis_translations)`,
    );
    expect(columns.map(({ name }) => name)).toEqual([
      "id",
      "attempt_id",
      "locale",
      "public_json",
      "created_at",
    ]);
    expect(columns.every((column) => column.notnull === 1)).toBe(true);
    expect(await db.all(sql`SELECT mode, code, locale, status FROM attempts`)).toEqual([
      { mode: "code", code: "legacy code", locale: "en", status: "diagnosed" },
    ]);
    for (const locale of ["en", "ar-EG"])
      await db.run(
        sql`INSERT INTO diagnosis_translations (id, attempt_id, locale, public_json, created_at) VALUES (${locale}, 'legacy', ${locale}, '{}', 0)`,
      );
    await expect(
      db.run(
        sql`INSERT INTO diagnosis_translations (id, attempt_id, locale, public_json, created_at) VALUES ('duplicate', 'legacy', 'en', '{}', 0)`,
      ),
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/UNIQUE/) } });
    await expect(
      db.run(
        sql`INSERT INTO diagnosis_translations (id, attempt_id, locale, public_json, created_at) VALUES ('orphan', 'missing', 'en', '{}', 0)`,
      ),
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/FOREIGN KEY/) } });
  } finally {
    close();
    rmSync(dir, { recursive: true, force: true });
  }
});
