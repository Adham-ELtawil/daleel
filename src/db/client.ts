import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

/** Await connect(db) or migrateDb(db) before issuing queries. */
export function createDb(options: { url: string; authToken?: string }) {
  if (options.url.startsWith("file:") && !options.url.includes(":memory:")) {
    const filename = options.url.startsWith("file://")
      ? fileURLToPath(options.url)
      : decodeURIComponent(options.url.slice(5).split("?")[0]);
    mkdirSync(dirname(resolve(filename)), { recursive: true });
  }
  // SQLite pragmas belong to a connection; keep one connection per client.
  const client = createClient({ ...options, concurrency: 1 });
  return { db: drizzle(client, { schema }), close: () => client.close() };
}

let singleton: ReturnType<typeof createDb> | undefined;

export function getDb() {
  singleton ??= createDb({
    url: process.env.DATABASE_URL ?? "file:./data/daleel.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  return singleton.db;
}

export async function connect(db: Db = getDb()): Promise<Db> {
  await db.run(sql`PRAGMA foreign_keys = ON`);
  return db;
}
