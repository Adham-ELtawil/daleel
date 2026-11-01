import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { seed } from "@/src/db/seed";
import { problems } from "@/src/db/schema";
import { getProblemByExternalId, type Problem } from "@/src/db/repo/problems";
import { createHandlers } from "@/src/services/handlers";
import { tempDb } from "@/tests/db/helpers";

const request = vi.hoisted(() => ({ locale: "en" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: request.locale }) }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error("not_found");
  },
}));
let store: Awaited<ReturnType<typeof tempDb>>;
let closePageDb: (() => void) | undefined;
let problem: Problem;
let id: string;
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("React", React);
  store = await tempDb();
  vi.stubEnv("DATABASE_URL", store.url);
  await seed(store.db);
  problem = (await getProblemByExternalId(store.db, "atcoder", "abc300_a"))!;
  const response = await createHandlers({ db: async () => store.db }).attempt(
    new Request("http://localhost/api/attempts", {
      method: "POST",
      body: JSON.stringify({ problemId: problem.id, language: "cpp17", code: "int main() {}" }),
    }),
  );
  expect(response.status).toBe(200);
  const result: { attemptId: string } = await response.json();
  id = result.attemptId;
});
afterEach(() => {
  closePageDb?.();
  closePageDb = undefined;
  store.cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function panel(locale: "en" | "ar-EG" = "en") {
  request.locale = locale;
  const { default: Page } = await import("@/app/attempt/[id]/page");
  const { getDb } = await import("@/src/db/client");
  closePageDb = () => getDb().$client.close();
  const html = renderToStaticMarkup(
    await Page({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve({}),
    }),
  );
  const details = html.match(/<details\b[\s\S]*?<\/details>/)?.[0];
  expect(details, "The attempt page must include the collapsible problem statement").toBeDefined();
  return details!;
}
it.each(["en", "ar-EG"] as const)(
  "shows the statement, specs and every sample in a closed LTR panel in %s",
  async (locale) => {
    const html = await panel(locale);
    expect(html).not.toMatch(/^<details[^>]*\bopen/);
    expect(html).toMatch(/<summary\b[^>]*>/);
    expect(html).toContain(locale === "en" ? "Problem statement" : "نص المسألة");
    expect(html.match(/<h3\b/g)).toHaveLength(2);
    expect(html).not.toContain("<h2");
    for (const text of [problem.statementMd, problem.inputSpecMd, problem.outputSpecMd]) {
      const escaped = renderToStaticMarkup(React.createElement("span", null, text)).slice(6, -7);
      expect(html).toContain(escaped);
    }
    const samples = [...html.matchAll(/<pre\b[^>]*dir="ltr"[^>]*>([\s\S]*?)<\/pre>/g)];
    expect(samples.slice(-problem.samples.length * 2).map((match) => match[1])).toEqual(
      problem.samples.flatMap((sample) => [sample.input, sample.output]),
    );
    expect(html).not.toMatch(/<(?:pre|p)\b(?![^>]*dir="ltr")/);
  },
);
it("escapes HTML and dangerous links throughout the statement, specs and samples", async () => {
  await store.db
    .update(problems)
    .set({
      statementMd: '<script>alert("statement")</script>',
      inputSpecMd: '<img src=x onerror="input()">',
      outputSpecMd: "[link](javascript:output())",
      samplesJson: JSON.stringify([
        { input: '<svg onload="sample()">\n', output: "<script>sample</script>\n" },
      ]),
    })
    .where(eq(problems.id, problem.id));
  const html = await panel("ar-EG");
  expect(html).toContain("&lt;script&gt;alert(&quot;statement&quot;)&lt;/script&gt;");
  expect(html).toContain("&lt;img src=x onerror=&quot;input()&quot;&gt;");
  expect(html).toContain("[link](javascript:output())");
  expect(html).toContain("&lt;svg onload=&quot;sample()&quot;&gt;\n");
  expect(html).toContain("&lt;script&gt;sample&lt;/script&gt;\n");
  expect(html).not.toMatch(/<(?:script|img|svg|a)\b/);
});
