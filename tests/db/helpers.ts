import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb, type Db } from "@/src/db/client";
import { migrateDb } from "@/src/db/migrate";

/** A migrated SQLite file in a temp dir; call cleanup() in afterEach. */
export async function tempDb(): Promise<{ db: Db; url: string; cleanup: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), "daleel-db-"));
  const url = `file:${join(dir, "test.db")}`;
  const { db, close } = createDb({ url });
  await migrateDb(db);
  return {
    db,
    url,
    cleanup: () => {
      close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
