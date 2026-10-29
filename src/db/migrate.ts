import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { migrate } from "drizzle-orm/libsql/migrator";
import { connect, getDb, type Db } from "./client";

export async function migrateDb(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: join(process.cwd(), "src/db/migrations") });
  await connect(db);
}

async function main(): Promise<void> {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const db = getDb();
  try {
    await migrateDb(db);
    console.log(`migrated ${process.env.DATABASE_URL ?? "file:./data/daleel.db"}`);
  } finally {
    db.$client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
