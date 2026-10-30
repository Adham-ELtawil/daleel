import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/health", () => {
  it("reports the replay environment flag without contacting Meta", async () => {
    vi.stubEnv("DEMO_REPLAY", "1");
    expect(await GET().json()).toMatchObject({ replay: true });
  });
  it("returns 200 with the planned health shape before db/meta/runner exist", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({
      db: "unknown",
      meta: "unknown",
      runner: "off",
      replay: false,
    });
  });

  it("is never cached", async () => {
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
