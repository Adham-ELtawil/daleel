import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attempts, diagnoses, llmCalls, users } from "@/src/db/schema";
import { seed } from "@/src/db/seed";
import { tempDb } from "@/tests/db/helpers";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

const secret = "public-launch-test-secret-with-32-plus-chars";
const sign = (id: string) =>
  `daleel_session=${id}.${createHmac("sha256", secret).update(id).digest("base64url")}`;
let store: Awaited<ReturnType<typeof tempDb>>;
let clock = Date.UTC(2026, 11, 1, 10);

async function load() {
  const mod = await import("@/src/services/handlers");
  return mod.createHandlers({ db: async () => store.db, now: () => clock });
}
const post = (user: string, body: object, ip?: string) =>
  new Request("http://localhost/api/attempts", {
    method: "POST",
    headers: { cookie: sign(user), ...(ip ? { "x-forwarded-for": ip } : {}) },
    body: JSON.stringify(body),
  });
async function addUser(id: string) {
  await store.db
    .insert(users)
    .values({ id, handle: id, role: "student", locale: "en", isGuest: 0, createdAt: clock });
}

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("SESSION_SECRET", secret);
  clock = Date.UTC(2026, 11, 1, 10);
  store = await tempDb();
  await seed(store.db);
  await addUser("trainee_a");
  await addUser("trainee_b");
});
afterEach(() => {
  store.cleanup();
  vi.unstubAllEnvs();
});

describe("clientIp", () => {
  it("uses the right-most forwarded address added by the tunnel, ignoring loopback", async () => {
    const { clientIp } = await import("@/src/services/abuse-limits");
    const req = (xff?: string) =>
      new Request("http://x/", { headers: xff ? { "x-forwarded-for": xff } : {} });
    expect(clientIp(req("6.6.6.6, 203.0.113.9"))).toBe("203.0.113.9");
    expect(clientIp(req("203.0.113.9, 127.0.0.1"))).toBe("203.0.113.9");
    expect(clientIp(req("::1"))).toBeNull();
    expect(clientIp(req())).toBeNull();
  });
});

describe("rate limiter", () => {
  it("allows the limit per key per window, then rejects with 429 rate_limited until the window passes", async () => {
    const { createRateLimiter } = await import("@/src/services/abuse-limits");
    let t = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
    limiter.hit("a");
    limiter.hit("a");
    limiter.hit("b");
    expect(() => limiter.hit("a")).toThrow(
      expect.objectContaining({ status: 429, code: "rate_limited" }),
    );
    t = 1001;
    expect(() => limiter.hit("a")).not.toThrow();
  });
});

describe("attempt limits", () => {
  it("caps attempts per user per UTC day at MAX_ATTEMPTS_PER_USER_PER_DAY", async () => {
    vi.stubEnv("MAX_ATTEMPTS_PER_USER_PER_DAY", "2");
    const handlers = await load();
    const problem = (await store.db.query.problems.findMany())[0];
    const body = { problemId: problem.id, code: "int main(){}", language: "cpp17" };
    expect((await handlers.attempt(post("trainee_a", body))).status).toBe(200);
    expect(
      (await handlers.attempt(post("trainee_a", { problemId: problem.id, mode: "idea" }))).status,
    ).toBe(200);
    const blocked = await handlers.attempt(post("trainee_a", body));
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error.code).toBe("daily_limit");
    expect((await handlers.attempt(post("trainee_b", body))).status).toBe(200);
    clock += 86400000;
    expect((await handlers.attempt(post("trainee_a", body))).status).toBe(200);
  });

  it("rate-limits model-calling requests per client IP across handles", async () => {
    vi.stubEnv("IP_RATE_LIMIT_PER_HOUR", "2");
    const handlers = await load();
    const problem = (await store.db.query.problems.findMany())[0];
    const body = { problemId: problem.id, code: "int main(){}", language: "cpp17" };
    expect((await handlers.attempt(post("trainee_a", body, "203.0.113.5"))).status).toBe(200);
    expect((await handlers.attempt(post("trainee_b", body, "203.0.113.5"))).status).toBe(200);
    const blocked = await handlers.attempt(post("trainee_b", body, "203.0.113.5"));
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error.code).toBe("rate_limited");
    expect((await handlers.attempt(post("trainee_b", body, "198.51.100.7"))).status).toBe(200);
  });
});

describe("admin stats", () => {
  const get = (token?: string) =>
    new Request("http://localhost/api/admin/stats", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  it("is hidden (404) without ADMIN_TOKEN configured or with a wrong token", async () => {
    let handlers = await load();
    expect((await handlers.adminStats(get("anything"))).status).toBe(404);
    vi.resetModules();
    vi.stubEnv("ADMIN_TOKEN", "a".repeat(32));
    handlers = await load();
    expect((await handlers.adminStats(get())).status).toBe(404);
    expect((await handlers.adminStats(get("b".repeat(32)))).status).toBe(404);
  });

  it("reports users, attempts, diagnoses and spend since launch with the token", async () => {
    vi.stubEnv("ADMIN_TOKEN", "a".repeat(32));
    vi.stubEnv("TOTAL_BUDGET_USD", "140");
    vi.stubEnv("BUDGET_SINCE", new Date(clock - 1000).toISOString());
    const handlers = await load();
    const problem = (await store.db.query.problems.findMany())[0];
    const base = {
      problemId: problem.id,
      mode: "code" as const,
      language: "cpp17" as const,
      code: "x",
      codeHash: "h",
      status: "new" as const,
      locale: "en" as const,
    };
    await store.db.insert(attempts).values([
      { ...base, id: "at_old", userId: "trainee_a", createdAt: clock - 5000 },
      { ...base, id: "at_new", userId: "trainee_b", createdAt: clock },
    ]);
    await store.db.insert(diagnoses).values({
      id: "dg_1",
      attemptId: "at_new",
      resultJson: "{}",
      bugClass: "overflow",
      topicsJson: "[]",
      confidence: 0.9,
      model: "muse-spark-1.3",
      reasoningEffort: "high",
      createdAt: clock,
    });
    const call = {
      step: "diagnose" as const,
      attemptId: null,
      model: "muse-spark-1.3",
      requestHash: "r",
      status: "ok" as const,
      httpStatus: 200,
      inputTokens: 1,
      outputTokens: 1,
      cachedTokens: 0,
      reasoningTokens: 0,
      latencyMs: 1,
      error: null,
    };
    await store.db.insert(llmCalls).values([
      { ...call, id: "c1", costUsd: 2, createdAt: clock - 5000 },
      { ...call, id: "c2", costUsd: 0.5, createdAt: clock },
    ]);
    const res = await handlers.adminStats(get("a".repeat(32)));
    expect(res.status).toBe(200);
    const stats = await res.json();
    expect(stats.sinceLaunch).toMatchObject({
      newUsers: 2,
      activeUsers: 1,
      attempts: 1,
      diagnoses: 1,
      llmCalls: 1,
      spendUsd: 0.5,
    });
    expect(stats.budget).toMatchObject({ capUsd: 140, spentUsd: 0.5, remainingUsd: 139.5 });
    expect(stats.allTime.attempts).toBeGreaterThanOrEqual(2);
    expect(stats.allTime.spendUsd).toBeGreaterThanOrEqual(2.5);
  });
});

describe("launch messages", () => {
  it("explains a paused budget and the new limits in both locales", () => {
    expect(en.intake.budget_reached).toMatch(/^Daleel is paused/);
    expect(ar.intake.budget_reached).toMatch(/^دليل متوقف مؤقتًا/);
    for (const key of ["daily_limit", "rate_limited"] as const) {
      expect(en.intake[key]).toMatch(/[A-Za-z]/);
      expect(ar.intake[key]).toMatch(/[\u0600-\u06FF]/);
      expect(ar.intake[key]).not.toMatch(/[A-Za-z]/);
    }
  });
});
