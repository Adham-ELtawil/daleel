import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { seed } from "@/src/db/seed";
import { teams, users } from "@/src/db/schema";
import { tempDb } from "@/tests/db/helpers";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

const request = vi.hoisted(() => ({ cookie: "", locale: "en" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: request.cookie }),
  cookies: async () => ({ get: () => ({ value: request.locale }) }),
}));
type Query = { team?: string | string[]; week?: string | string[] };
let store: Awaited<ReturnType<typeof tempDb>>;
let closePageDb: (() => void) | undefined;
let sign: (id: string) => string;
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("React", React);
  vi.stubEnv("SESSION_SECRET", "pr20-test-secret-with-at-least-32-characters");
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-31T12:00:00Z"));
  store = await tempDb();
  vi.stubEnv("DATABASE_URL", store.url);
  await seed(store.db, Date.now(), true);
  sign = (await import("@/src/services/session")).signSession;
  request.cookie = `daleel_session=${sign("coach_demo")}`;
  request.locale = "en";
});
afterEach(() => {
  closePageDb?.();
  closePageDb = undefined;
  store.cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function render(query: Query = {}, path = "app/coach/report/page.tsx") {
  const file = resolve(path);
  expect(existsSync(file), "The printable /coach/report page is missing").toBe(true);
  const {
    default: Page,
  }: { default: (props: { searchParams: Promise<Query> }) => Promise<React.ReactElement> } =
    await import(file);
  const { getDb } = await import("@/src/db/client");
  closePageDb = () => getDb().$client.close();
  return renderToStaticMarkup(await Page({ searchParams: Promise.resolve(query) }));
}

it.each(["en", "ar-EG"] as const)(
  "renders the complete DEMO report and five LTR CF links in %s",
  async (locale) => {
    request.locale = locale;
    const html = await render({ team: "demo_team", week: "2026-10-26" });
    expect(html).toContain(`dir="${locale === "en" ? "ltr" : "rtl"}"`);
    expect(html).toContain("DEMO");
    expect(html).toContain("2026-10-26");
    const copy =
      locale === "en"
        ? [
            "Weekly report",
            "Recommended problems",
            "Session plan",
            "Needs attention",
            "Top topics",
            "Top bug classes",
            "Print report",
          ]
        : [
            "تقرير الأسبوع",
            "مسائل مقترحة",
            "خطة التمرين",
            "محتاجين متابعة",
            "أكتر مواضيع محتاجة تدريب",
            "أكتر أنواع الـ bugs",
            "اطبع التقرير",
          ];
    for (const label of copy) expect(html).toContain(label);
    expect(
      html.match(/href="https:\/\/codeforces\.com\/problemset\/problem\/\d+\/[A-Z][0-9]*"/g),
    ).toHaveLength(5);
    expect(html).toMatch(/<bdi dir="ltr">/);
    expect(html).toContain("trainee_01");
    expect(html).toContain("trainee_17");
    expect(html).toContain("edge_case");
    expect(html).toContain("overflow");
    expect(html).toMatch(/<button[^>]*type="button"/);
    expect(html).not.toMatch(/brute_code|root_cause_internal|fix_internal|codeHash/);
    expect(html).toContain('href="/coach?team=demo_team&amp;week=2026-10-26"');
  },
);

it("links from /coach with the selected team and week", async () => {
  const html = await render({ team: "demo_team", week: "2026-10-19" }, "app/coach/page.tsx");
  expect(html).toContain('href="/coach/report?team=demo_team&amp;week=2026-10-19"');
});

it("prints without navigation on a light background and handles a week with no candidates", async () => {
  const html = await render({ team: "demo_team", week: "2026-10-12" });
  expect(html).toContain("No attempts this week.");
  expect(html).toContain("No matching unattempted problems in this rating band.");
  expect(html).not.toContain("https://codeforces.com/problemset/problem/");
  const print = readFileSync("app/globals.css", "utf8").split("@media print")[1] ?? "";
  expect(print).toContain("display: none");
  expect(print).toMatch(/background:\s*(#fff(?:fff)?|white)/);
  expect(print).toContain("break-inside: avoid");
});

it.each(["", "trainee_01", "coach_other"])(
  "does not reveal the report to session %s",
  async (handle) => {
    if (handle === "coach_other")
      await store.db
        .insert(users)
        .values({ id: handle, handle, role: "coach", locale: "en", isGuest: 0, createdAt: 0 });
    request.cookie = handle ? `daleel_session=${sign(handle)}` : "";
    const html = await render({ team: "demo_team", week: "2026-10-26" });
    expect(html).not.toContain("trainee_01");
    expect(html).not.toContain("https://codeforces.com/problemset/problem/");
  },
);

it.each([
  { team: "private" },
  { team: ["demo_team"] },
  { week: ["2026-10-26"] },
  { week: "2026-10-27" },
  { week: "2026-02-30" },
])("rejects invalid report selection %j", async (query) => {
  await store.db.insert(users).values({
    id: "coach_private",
    handle: "coach_private",
    role: "coach",
    locale: "en",
    isGuest: 0,
    createdAt: 0,
  });
  await store.db.insert(teams).values({
    id: "private",
    name: "Private team",
    coachId: "coach_private",
    inviteCode: "PRIVATE1",
    createdAt: 0,
  });
  const html = await render(query);
  expect(html).toContain("Choose one of your teams and a Monday date.");
  expect(html).not.toMatch(/trainee_01|Private team|PRIVATE1/);
});

it("has complete Arabic-first report and per-topic template translations", () => {
  for (const scope of ["report", "report_why"]) {
    const schema = z.record(z.string(), z.string().min(1));
    expect(en).toHaveProperty(scope);
    expect(ar).toHaveProperty(scope);
    const english = schema.parse(Reflect.get(en, scope));
    const arabic = schema.parse(Reflect.get(ar, scope));
    expect(Object.keys(arabic)).toEqual(Object.keys(english));
    for (const line of Object.values(arabic)) {
      expect(line).toMatch(/^[\u0600-\u06ff]/);
      expect(line).not.toMatch(/[()\/→←]/);
    }
  }
});
