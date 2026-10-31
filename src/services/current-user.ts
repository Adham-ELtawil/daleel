import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import type { Db } from "@/src/db/client";
import { users } from "@/src/db/schema";

export async function getCurrentUser(db: Db, cookie: string | null = null) {
  const token = cookie?.match(/(?:^|;\s*)daleel_session=([^;]*)/)?.[1];
  if (token) {
    const { verifySession } = await import("./session");
    const id = verifySession(token);
    const user = id && (await db.select().from(users).where(eq(users.id, id)).get());
    if (user) return user;
  }
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
