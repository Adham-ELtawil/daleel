import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { attempts, diagnoses, teams, teamMembers, users } from "@/src/db/schema";
import { getCurrentUser } from "@/src/services/current-user";
import { createHandlers } from "@/src/services/handlers";
import { seed } from "@/src/db/seed";
import { tempDb } from "@/tests/db/helpers";

type User = { id: string; handle: string; role: "student" | "coach"; locale: "en" | "ar-EG" };
type Team = { id: string; name: string; inviteCode: string };
let store: Awaited<ReturnType<typeof tempDb>>;
let closeRouteDb: (() => void) | undefined;
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("SESSION_SECRET", "pr19a-test-secret-with-at-least-32-characters");
  store = await tempDb();
  vi.stubEnv("DATABASE_URL", store.url);
});
afterEach(() => {
  closeRouteDb?.();
  closeRouteDb = undefined;
  store.cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
async function post(path: string, body: unknown, cookie = "") {
  const file = resolve(`app/api/${path}/route.ts`);
  expect(existsSync(file), `POST /api/${path} behaviour is missing`).toBe(true);
  const route: { POST: (request: Request) => Promise<Response> } = await import(file);
  const { getDb } = await import("@/src/db/client");
  closeRouteDb = () => getDb().$client.close();
  return route.POST(
    new Request(`http://localhost/api/${path}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { cookie, "x-request-id": "pr19a-test" },
    }),
  );
}
async function login(handle: string, role: User["role"] = "student", extra: object = {}) {
  const response = await post("session", { handle, role, ...extra });
  expect(response.status).toBe(200);
  const data: { user: User; team?: Team } = await response.json();
  return { ...data, cookie: response.headers.get("set-cookie")!.split(";")[0], response };
}
async function createTeam() {
  const coach = await login("coach_demo", "coach");
  const response = await post("teams", { name: "Training" }, coach.cookie);
  expect(response.status).toBe(200);
  const { team }: { team: Team } = await response.json();
  return { coach, team };
}
async function stats(id: string, cookie = "", week = "2026-11-02") {
  const file = resolve("app/api/teams/[id]/stats/route.ts");
  expect(existsSync(file), "Team stats route behaviour is missing").toBe(true);
  const {
    GET,
  }: {
    GET: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
  } = await import(file);
  return GET(
    new Request(`http://localhost/api/teams/${id}/stats?week=${week}`, {
      headers: { cookie, "x-request-id": "pr19a-test" },
    }),
    { params: Promise.resolve({ id }) },
  );
}
it("creates and resumes a handle-only session and reads its signed httpOnly cookie", async () => {
  const first = await login("trainee_01", "student", { locale: "ar-EG" });
  expect(first.user).toEqual({
    id: expect.any(String),
    handle: "trainee_01",
    role: "student",
    locale: "ar-EG",
  });
  expect(first.response.headers.get("set-cookie")).toMatch(/daleel_session=.+;.*HttpOnly/i);
  expect(first.response.headers.get("set-cookie")).toMatch(/SameSite=Lax/i);
  expect(first.response.headers.get("set-cookie")).toMatch(/Path=\//);
  expect(first.response.headers.get("x-request-id")).toBe("pr19a-test");
  expect((await login("trainee_01")).user.id).toBe(first.user.id);
  expect(await getCurrentUser(store.db, first.cookie)).toMatchObject({ id: first.user.id });
  expect(
    await getCurrentUser(store.db, first.cookie.replace(first.user.id, "missing")),
  ).toMatchObject({ handle: "guest_local" });
});
it.each(["", "ab", "x".repeat(25), "bad space", "guest_local"])(
  "rejects invalid or reserved handle %s",
  async (handle) => {
    const response = await post("session", { handle, role: "student" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "invalid", message: expect.any(String) },
    });
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(await store.db.query.users.findMany()).toHaveLength(0);
  },
);
it("rejects a role change for an existing handle", async () => {
  await login("trainee_01");
  expect((await post("session", { handle: "trainee_01", role: "coach" })).status).toBe(409);
});
it("sets Secure on production session cookies", async () => {
  vi.stubEnv("NODE_ENV", "production");
  expect((await login("trainee_01")).response.headers.get("set-cookie")).toMatch(/; Secure/i);
});
it("creates teams with unique eight-character invites; joins are idempotent", async () => {
  const { coach, team } = await createTeam();
  expect(team).toEqual({
    id: expect.any(String),
    name: "Training",
    inviteCode: expect.stringMatching(/^[A-Z0-9]{8}$/),
  });
  expect(await store.db.query.teams.findMany()).toMatchObject([
    { id: team.id, coachId: coach.user.id },
  ]);
  const second: { team: Team } = await (
    await post("teams", { name: "Second" }, coach.cookie)
  ).json();
  expect(second.team.inviteCode).not.toBe(team.inviteCode);
  const student = await login("trainee_01");
  for (let n = 0; n < 2; n++) {
    const response = await post("teams/join", { inviteCode: team.inviteCode }, student.cookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ team: { id: team.id, name: team.name } });
  }
  expect(await store.db.select().from(teamMembers)).toHaveLength(1);
});
it("joins during session creation and rolls back an invalid invite", async () => {
  const { team } = await createTeam();
  expect((await login("trainee_01", "student", { inviteCode: team.inviteCode })).team).toEqual({
    id: team.id,
    name: team.name,
  });
  expect(
    (await post("session", { handle: "trainee_02", role: "student", inviteCode: "ZZZZZZZZ" }))
      .status,
  ).toBe(404);
  expect((await store.db.select().from(users)).map((u) => u.handle)).not.toContain("trainee_02");
});
it("rejects non-coaches, guest joins, malformed bodies, and missing invites", async () => {
  expect((await post("teams", { name: "Training" })).status).toBe(403);
  const { coach, team } = await createTeam();
  const student = await login("trainee_01");
  expect((await post("teams", { name: "Training" }, student.cookie)).status).toBe(403);
  expect((await post("teams", { name: " " }, coach.cookie)).status).toBe(400);
  expect((await post("teams/join", { inviteCode: team.inviteCode })).status).toBe(403);
  expect((await post("teams/join", { inviteCode: "bad" }, student.cookie)).status).toBe(400);
  expect((await post("teams/join", { inviteCode: "ZZZZZZZZ" }, student.cookie)).status).toBe(404);
});
it("returns stats only for the owning coach; students, guests, other coaches and tampering get 403", async () => {
  const { coach, team } = await createTeam();
  const student = await login("trainee_01");
  await post("teams/join", { inviteCode: team.inviteCode }, student.cookie);
  const other = await login("coach_other", "coach");
  for (const cookie of [
    "",
    student.cookie,
    other.cookie,
    student.cookie.replace(student.user.id, coach.user.id),
  ]) {
    const response = await stats(team.id, cookie);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "forbidden", message: expect.any(String) },
    });
  }
  expect((await stats("missing", coach.cookie)).status).toBe(404);
  expect((await stats(team.id, coach.cookie, "2026-11-03")).status).toBe(400);
  expect((await stats(team.id, coach.cookie, "2026-02-30")).status).toBe(400);
});
it("computes stats from only member attempts and diagnosis topics in the requested week", async () => {
  const { coach, team } = await createTeam();
  const student = await login("trainee_01");
  await post("teams/join", { inviteCode: team.inviteCode }, student.cookie);
  await seed(store.db);
  const problem = (await store.db.query.problems.findMany())[0];
  const values = {
    problemId: problem.id,
    language: "cpp17" as const,
    code: "private code",
    codeHash: "hash",
    locale: "en" as const,
    createdAt: Date.parse("2026-11-02T10:00:00Z"),
    maxHintLevel: 4,
  };
  await store.db.insert(attempts).values([
    { ...values, id: "member", userId: student.user.id, status: "solved" },
    { ...values, id: "outsider", userId: coach.user.id, status: "stuck" },
    {
      ...values,
      id: "previous",
      userId: student.user.id,
      status: "stuck",
      createdAt: Date.parse("2026-11-01T21:59:59Z"),
    },
  ]);
  await store.db.insert(diagnoses).values({
    id: "diagnosis",
    attemptId: "member",
    resultJson: "{}",
    topicsJson: '["math"]',
    bugClass: "edge_case",
    confidence: 1,
    model: "fixture",
    reasoningEffort: "low",
    createdAt: values.createdAt,
  });
  const response = await stats(team.id, coach.cookie);
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data).toMatchObject({
    stats: {
      weekStart: "2026-11-02",
      attempts: 1,
      solved: 1,
      solvedRate: 1,
      avgHintLevelAtSolve: 4,
      topTags: [{ tag: "math", count: 1 }],
      topBugClasses: [{ bugClass: "edge_case", count: 1 }],
      attention: [{ handle: "trainee_01" }],
    },
  });
  expect(JSON.stringify(data)).not.toMatch(/private code|resultJson|inviteCode/);
  expect(await store.db.select().from(teams)).not.toHaveLength(0);
});
it("attributes newly created attempts to the session user", async () => {
  const student = await login("trainee_01");
  await seed(store.db);
  const problem = (await store.db.query.problems.findMany())[0];
  const response = await createHandlers({ db: async () => store.db }).attempt(
    new Request("http://localhost/api/attempts", {
      method: "POST",
      headers: { cookie: student.cookie },
      body: JSON.stringify({ problemId: problem.id, language: "cpp17", code: "fixture" }),
    }),
  );
  expect(response.status).toBe(200);
  expect(await store.db.select().from(attempts)).toMatchObject([{ userId: student.user.id }]);
});
