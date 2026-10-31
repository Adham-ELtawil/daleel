import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { seed } from "@/src/db/seed";
import { users } from "@/src/db/schema";
import { createHandlers } from "@/src/services/handlers";
import { verifySession } from "@/src/services/session";
import { tempDb } from "@/tests/db/helpers";

afterEach(() => vi.unstubAllGlobals());
async function entry() {
  const path = resolve("src/components/demo-coach.tsx");
  expect(existsSync(path), "The demo coach session action is missing").toBe(true);
  const mod: { openDemoCoach: (refresh: () => void) => Promise<void> } = await import(path);
  return mod.openDemoCoach;
}
it("POSTs the demo coach identity and refreshes after the session cookie is issued", async () => {
  const open = await entry();
  const store = await tempDb();
  try {
    await seed(store.db, Date.now(), true);
    const handlers = createHandlers({ db: async () => store.db });
    let cookie: string | null = null;
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      expect(input).toBe("/api/session");
      const request = new Request("http://localhost/api/session", init);
      expect(request.method).toBe("POST");
      expect(request.headers.get("content-type")).toBe("application/json");
      expect(await request.clone().json()).toEqual({ handle: "coach_demo", role: "coach" });
      const response = await handlers.session(request);
      expect(response.status).toBe(200);
      cookie = response.headers.get("set-cookie");
      return response;
    });
    vi.stubGlobal("fetch", fetch);
    const refresh = vi.fn(() => expect(cookie).toContain("daleel_session="));
    await open(refresh);
    expect(fetch).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    const coach = await store.db.select().from(users).where(eq(users.handle, "coach_demo")).get();
    expect(verifySession(String(cookie).split(";")[0].slice("daleel_session=".length))).toBe(
      coach?.id,
    );
  } finally {
    store.cleanup();
  }
});
it.each(["http", "network"])(
  "does not refresh when session creation fails at the %s boundary",
  async (failure) => {
    const open = await entry();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (failure === "network") throw new Error("offline");
        return Response.json({ error: { code: "role_conflict" } }, { status: 409 });
      }),
    );
    const refresh = vi.fn();
    await expect(open(refresh)).rejects.toThrow();
    expect(refresh).not.toHaveBeenCalled();
  },
);
