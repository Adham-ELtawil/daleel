import React from "react";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { seed } from "@/src/db/seed";
import { attempts, diagnoses, teams, teamMembers, users } from "@/src/db/schema";
import { tempDb } from "@/tests/db/helpers";
import rows from "@/tests/fixtures/coach/attempts.json";
import diagnosis from "@/tests/fixtures/llm/diagnosis-a.json";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

const request = vi.hoisted(() => ({ cookie: "", locale: "en" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: request.cookie }),
  cookies: async () => ({ get: () => ({ value: request.locale }) }),
}));
let store: Awaited<ReturnType<typeof tempDb>>;
let closePageDb: (() => void) | undefined;
let sign: (id: string) => string;
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("React", React);
  vi.stubEnv("SESSION_SECRET", "pr19b-test-secret-with-at-least-32-characters");
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-31T12:00:00Z"));
  store = await tempDb();
  vi.stubEnv("DATABASE_URL", store.url);
  sign = (await import("@/src/services/session")).signSession;
  request.cookie = `daleel_session=${sign("coach_fixture")}`;
  request.locale = "en";
  await seed(store.db);
  await store.db.insert(users).values(
    ["coach_fixture", "coach_other", "trainee_01", "trainee_02", "trainee_03"].map((handle) => ({
      id: handle,
      handle,
      role: handle.startsWith("coach") ? ("coach" as const) : ("student" as const),
      locale: "en" as const,
      isGuest: 0,
      createdAt: 0,
    })),
  );
  await store.db.insert(teams).values([
    {
      id: "team_a",
      name: "Fixture A",
      coachId: "coach_fixture",
      inviteCode: "FIXTUREA",
      createdAt: 0,
    },
    {
      id: "team_b",
      name: "Fixture B",
      coachId: "coach_fixture",
      inviteCode: "FIXTUREB",
      createdAt: 0,
    },
    {
      id: "private",
      name: "Private team",
      coachId: "coach_other",
      inviteCode: "PRIVATE1",
      createdAt: 0,
    },
  ]);
  await store.db.insert(teamMembers).values(
    ["trainee_01", "trainee_02", "trainee_03"].map((userId) => ({
      teamId: "team_a",
      userId,
      joinedAt: 0,
    })),
  );
  const problem = (await store.db.query.problems.findMany())[0];
  for (const [index, row] of rows.entries()) {
    await store.db.insert(attempts).values({
      ...row,
      status: z.enum(attempts.status.enumValues).parse(row.status),
      id: `fixture_${index}`,
      problemId: problem.id,
      code: "private student code",
      codeHash: "fixture",
      language: "cpp17",
      locale: "en",
      createdAt: Date.parse("2026-10-27T12:00:00Z"),
    });
    await store.db.insert(diagnoses).values({
      id: `fixture_${index}`,
      attemptId: `fixture_${index}`,
      resultJson: JSON.stringify({ ...diagnosis, topics: row.topics, bug_class: row.bugClass }),
      topicsJson: JSON.stringify(row.topics),
      bugClass: row.bugClass,
      confidence: 1,
      model: "fixture",
      reasoningEffort: "low",
      createdAt: 0,
    });
  }
});
afterEach(() => {
  closePageDb?.();
  closePageDb = undefined;
  store.cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function render(params: { team?: string; week?: string } = {}) {
  const path = resolve("app/coach/page.tsx");
  expect(existsSync(path), "The /coach dashboard is missing").toBe(true);
  const {
    default: Page,
  }: { default: (props: { searchParams: Promise<typeof params> }) => Promise<React.ReactElement> } =
    await import(path);
  const { getDb } = await import("@/src/db/client");
  closePageDb = () => getDb().$client.close();
  return renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params) }));
}
it.each(["en", "ar-EG"] as const)(
  "renders the fixture stats, attention list and accessible pickers in %s",
  async (locale) => {
    request.locale = locale;
    const html = await render();
    const copy =
      locale === "en"
        ? [
            "Coach dashboard",
            "Per-trainee stats",
            "Needs attention",
            "Attempts",
            "Solved rate",
            "Average hint level at solve",
            "Top topics",
            "Top bug classes",
          ]
        : [
            "متابعة الفريق",
            "إحصائيات كل متدرّب",
            "محتاجين متابعة",
            "المحاولات",
            "نسبة الحل",
            "متوسط مستوى الـ hint وقت الحل",
            "أكتر مواضيع محتاجة تدريب",
            "أكتر أنواع الـ bugs",
          ];
    for (const label of copy) expect(html).toContain(label);
    expect(html).toContain(`dir="${locale === "en" ? "ltr" : "rtl"}"`);
    expect(html).toMatch(/<form[^>]*action="\/coach"[^>]*method="get"/);
    expect(html).toMatch(/<label[^>]*for="team"/);
    expect(html).toMatch(/<select[^>]*id="team"[^>]*name="team"/);
    expect(html).toMatch(/<label[^>]*for="week"/);
    expect(html).toContain('name="week"');
    expect(html).toContain("2026-10-26");
    expect(html).toContain("Fixture B");
    expect(html).toContain("FIXTUREA");
    expect(html).not.toContain("Private team");
    const table = html.match(/<table[\s\S]*?<\/table>/)?.[0] ?? "";
    expect(table.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0].match(/<tr/g)).toHaveLength(3);
    for (const handle of ["trainee_01", "trainee_02", "trainee_03"])
      expect(table).toContain(handle);
    expect(table).toContain(
      new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(0.5),
    );
    const attention =
      html.match(/<section[^>]*aria-labelledby="attention"[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(attention).toContain("trainee_01");
    expect(attention).toContain("trainee_02");
    expect(attention).not.toContain("trainee_03");
    expect(html).toContain("math");
    expect(html).toContain("off_by_one");
    expect(html).not.toMatch(/private student code|root_cause_internal|fix_internal/);
  },
);
it("uses the selected team/week and shows empty states without leaking another team's stats", async () => {
  const previous = await render({ team: "team_a", week: "2026-10-19" });
  expect(previous).toContain("No attempts this week.");
  expect(previous).toContain("No trainees need attention this week.");
  expect(previous).not.toContain("trainee_01");
  const other = await render({ team: "team_b", week: "2026-10-26" });
  expect(other).toContain('value="team_b" selected');
  expect(other).toContain("FIXTUREB");
  expect(other).not.toContain("trainee_01");
});
it.each([{}, { team: "private" }, { week: "2026-10-27" }, { week: "bad" }])(
  "handles missing access or invalid selections: %j",
  async (params) => {
    if (!Object.keys(params).length) request.cookie = "";
    const html = await render(params);
    expect(html).not.toContain("<table");
    expect(html).not.toContain("trainee_01");
    expect(html).not.toContain("PRIVATE1");
  },
);
it("does not expose dashboard data to a signed trainee", async () => {
  request.cookie = `daleel_session=${sign("trainee_01")}`;
  expect(await render({ team: "team_a" })).not.toContain("<table");
});
it("has nonempty Egyptian Arabic copy, matching English keys", () => {
  expect(en).toHaveProperty("coach");
  expect(ar).toHaveProperty("coach");
  const english = z.record(z.string(), z.string().min(1)).parse(Reflect.get(en, "coach"));
  const arabic = z.record(z.string(), z.string().min(1)).parse(Reflect.get(ar, "coach"));
  expect(Object.keys(arabic)).toEqual(Object.keys(english));
  for (const line of Object.values(arabic)) {
    expect(line).toMatch(/^[\u0600-\u06ff]/);
    expect(line).not.toMatch(/[()\/→←]/);
  }
});
