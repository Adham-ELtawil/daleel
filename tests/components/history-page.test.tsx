import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { attempts, diagnoses, problems, users } from "@/src/db/schema";
import { tempDb } from "@/tests/db/helpers";
import rows from "@/tests/fixtures/llm/ladder-service.json";

const request = vi.hoisted(() => ({ locale: "en" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => ({ value: request.locale }) }),
}));
let store: Awaited<ReturnType<typeof tempDb>>;
let closePageDb: (() => void) | undefined;
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("React", React);
  store = await tempDb();
  vi.stubEnv("DATABASE_URL", store.url);
  await store.db.insert(users).values({
    ...rows.user,
    id: "guest_local",
    handle: "guest_local",
    role: "student",
    locale: "en",
  });
  await store.db.insert(problems).values({ ...rows.problem, judge: "codeforces" });
});
afterEach(() => {
  closePageDb?.();
  closePageDb = undefined;
  store.cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function render() {
  const { default: Page } = await import("@/app/me/page");
  const { getDb } = await import("@/src/db/client");
  closePageDb = () => getDb().$client.close();
  return renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
}
it.each(["en", "ar-EG"])("shows localized bug classes in history in %s", async (locale) => {
  request.locale = locale;
  await store.db.insert(attempts).values({
    ...rows.attempt,
    userId: "guest_local",
    language: "cpp17",
    locale: "en",
    status: "diagnosed",
  });
  await store.db.insert(diagnoses).values(rows.diagnosis);
  const html = await render();
  expect(html).toContain(locale === "en" ? "Missed edge case" : "حالة خاصة فاتتك");
  expect(html).not.toContain("edge_case");
});
it.each(["en", "ar-EG"])("links the empty history to a new attempt in %s", async (locale) => {
  request.locale = locale;
  const html = await render();
  expect(html).toMatch(/role="status"[^>]*class="[^"]*\bcard\b/);
  expect(html).toContain('href="/problem"');
  expect(html).toContain(locale === "en" ? "New attempt" : "محاولة جديدة");
});
it.each(["en", "ar-EG"])("shows the idea badge instead of a bug class in %s", async (locale) => {
  request.locale = locale;
  await store.db.insert(attempts).values({
    ...rows.attempt,
    mode: "idea",
    code: "",
    userId: "guest_local",
    language: "cpp17",
    locale: "en",
    status: "new",
  });
  const html = await render();
  expect(html).toMatch(
    new RegExp(
      `<span[^>]*class="[^"]*badge[^>]*>${locale === "en" ? "Idea hints" : "تلميحات الفكرة"}<`,
    ),
  );
  expect(html).not.toContain(locale === "en" ? "Missed edge case" : "حالة خاصة فاتتك");
});
