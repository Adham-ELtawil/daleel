import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb, type Db } from "@/src/db/client";
import { migrateDb } from "@/src/db/migrate";

/** A migrated SQLite file in a temp dir; call cleanup() in afterEach. */
export async function tempDb(): Promise<{ db: Db; cleanup: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), "daleel-db-"));
  const { db, close } = createDb({ url: `file:${join(dir, "test.db")}` });
  await migrateDb(db);
  return {
    db,
    cleanup: () => {
      close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
