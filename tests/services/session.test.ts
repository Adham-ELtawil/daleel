import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/src/services/current-user";
import { tempDb } from "@/tests/db/helpers";

let session: {
  signSession: (userId: string) => string;
  verifySession: (cookie: string) => string | null;
};
let store: Awaited<ReturnType<typeof tempDb>>;
const secret = "pr19a-test-secret-with-at-least-32-characters";
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("SESSION_SECRET", secret);
  store = await tempDb();
});
afterEach(() => {
  store.cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
async function loadSession() {
  const path = resolve("src/services/session.ts");
  expect(existsSync(path), "Signed session behaviour is missing").toBe(true);
  session = await import(path);
}
it("signs only the user id with HMAC SHA-256 and verifies it", async () => {
  await loadSession();
  const signature = createHmac("sha256", secret).update("trainee_01").digest("base64url");
  expect(session.signSession("trainee_01")).toBe(`trainee_01.${signature}`);
  expect(session.verifySession(session.signSession("trainee_01"))).toBe("trainee_01");
});
it("rejects changed identities, changed signatures, and malformed tokens", async () => {
  await loadSession();
  const valid = session.signSession("trainee_01");
  for (const invalid of [
    valid.replace("trainee_01", "coach_demo"),
    valid.slice(0, -1) + "!",
    "",
    "unsigned",
    "id.sig.extra",
    "id.x",
    "id." + "a".repeat(43),
  ])
    expect(session.verifySession(invalid)).toBeNull();
});
it("generates one development secret and emits a warning without the secret", async () => {
  vi.stubEnv("SESSION_SECRET", "");
  vi.stubEnv("NODE_ENV", "development");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await loadSession();
  const first = session.signSession("trainee_01");
  expect(session.signSession("trainee_01")).toBe(first);
  expect(session.verifySession(first)).toBe("trainee_01");
  expect(warn).toHaveBeenCalledOnce();
  expect(warn).toHaveBeenCalledWith({ requestId: "startup", code: "session_secret_generated" });
});
it.each(["", "short"])(
  "fails at startup in production with missing/short secret %#",
  async (value) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", value);
    const path = resolve("src/services/session.ts");
    expect(existsSync(path), "Signed session behaviour is missing").toBe(true);
    await expect(import(path)).rejects.toThrow("SESSION_SECRET");
  },
);
it("falls back to the same local guest for no cookie, malformed cookies, and unknown ids", async () => {
  await loadSession();
  for (const cookie of [
    null,
    "other=1; daleel_session=invalid",
    `daleel_session=${session.signSession("missing")}`,
  ]) {
    const user = await getCurrentUser(store.db, cookie);
    expect(user).toMatchObject({ handle: "guest_local", role: "student", isGuest: 1 });
  }
  expect(await store.db.query.users.findMany()).toHaveLength(1);
});
