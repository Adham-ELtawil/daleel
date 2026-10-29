import { rmSync } from "node:fs";
import { createDb } from "@/src/db/client";
import { migrateDb } from "@/src/db/migrate";
import { seed } from "@/src/db/seed";

async function setup() {
  rmSync("data/e2e.db", { force: true });
  const { db, close } = createDb({ url: "file:./data/e2e.db" });
  try {
    await migrateDb(db);
    await seed(db);
  } finally {
    close();
  }
}
void setup();
