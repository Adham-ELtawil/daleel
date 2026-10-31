import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import type { Db } from "@/src/db/client";
import { users } from "@/src/db/schema";
import { SessionEnvSchema } from "@/src/env";
import { HttpError } from "./http-error";
import { InviteSchema, joinTeam } from "./teams";

const env = SessionEnvSchema.safeParse(process.env);
if (!env.success) throw new Error("SESSION_SECRET must contain at least 32 characters");
const secret = env.data.SESSION_SECRET || randomBytes(32).toString("hex");
if (!env.data.SESSION_SECRET)
  console.warn({ requestId: "startup", code: "session_secret_generated" });
export function signSession(userId: string) {
  return `${userId}.${createHmac("sha256", secret).update(userId).digest("base64url")}`;
}
export function verifySession(cookie: string) {
  if (!/^[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9_-]{43}$/.test(cookie)) return null;
  const userId = cookie.split(".")[0];
  return timingSafeEqual(Buffer.from(cookie), Buffer.from(signSession(userId))) ? userId : null;
}
export const SessionSchema = z.strictObject({
  handle: z
    .string()
    .regex(/^[A-Za-z0-9_-]{3,24}$/)
    .refine((handle) => handle !== "guest_local"),
  role: z.enum(["student", "coach"]),
  inviteCode: InviteSchema.optional(),
  locale: z.enum(["en", "ar-EG"]).optional(),
});
// Handle-only demo identity: knowing a handle resumes it; this is not password authentication.
export async function startSession(db: Db, input: z.infer<typeof SessionSchema>) {
  const data = await db.transaction(async (tx) => {
    await tx
      .insert(users)
      .values({
        id: ulid(),
        handle: input.handle,
        role: input.role,
        locale: input.locale ?? "en",
        isGuest: 0,
        createdAt: Date.now(),
      })
      .onConflictDoNothing({ target: users.handle });
    const stored = (await tx.select().from(users).where(eq(users.handle, input.handle)).get())!;
    if (stored.role !== input.role || stored.isGuest) throw new HttpError(409, "role_conflict");
    const { id, handle, role } = stored;
    const locale = input.locale ?? stored.locale;
    if (locale !== stored.locale) await tx.update(users).set({ locale }).where(eq(users.id, id));
    const team = input.inviteCode ? await joinTeam(tx, stored, input.inviteCode) : undefined;
    return { user: { id, handle, role, locale }, ...(team ? { team } : {}) };
  });
  return Response.json(data, {
    headers: {
      "set-cookie": `daleel_session=${signSession(data.user.id)}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    },
  });
}
