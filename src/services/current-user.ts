import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import type { Db } from "@/src/db/client";
import { users } from "@/src/db/schema";

export async function getCurrentUser(db: Db) {
  // TODO(session PR): Replace the shared local guest with the signed-cookie user.
  await db
    .insert(users)
    .values({
      id: ulid(),
      handle: "guest_local",
      role: "student",
      locale: "en",
      isGuest: 1,
      createdAt: Date.now(),
    })
    .onConflictDoNothing({ target: users.handle });
  return (await db.select().from(users).where(eq(users.handle, "guest_local")).get())!;
}
