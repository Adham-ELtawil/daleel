import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getDb } from "@/src/db/client";
import { attempts, users } from "@/src/db/schema";
import { seed } from "@/src/db/seed";
import { createHandlers } from "@/src/services/handlers";
import { noNetworkFetch } from "@/tests/llm/fake-fetch";
import { tempDb } from "@/tests/db/helpers";

type Example = {
  problemId: string;
  judge: string;
  externalId: string;
  title: string;
  locale: "en" | "ar-EG";
  code: string;
};
const fixtures = [
  ["codeforces", "4A", "Watermelon", "en", "cf-4A-watermelon"],
  ["codeforces", "1A", "Theatre Square", "ar-EG", "cf-1A-theatre-square"],
  ["atcoder", "abc300_a", "N-choice question", "en", "atcoder-abc300_a"],
] as const;
let store: Awaited<ReturnType<typeof tempDb>>;
let routeLoaded = false;
beforeEach(async () => {
  vi.stubGlobal("fetch", noNetworkFetch);
  store = await tempDb();
  await seed(store.db);
  vi.stubEnv("DATABASE_URL", store.url);
});
afterEach(() => {
  if (routeLoaded) getDb().$client.close();
  store.cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("POST /api/session/demo returns three exact examples and keeps one guest_local", async () => {
  const path = resolve("app/api/session/demo/route.ts");
  expect(existsSync(path), "The demo session route is missing").toBe(true);
  const { POST }: { POST: (request: Request) => Promise<Response> } = await import(path);
  routeLoaded = true;
  for (let repeat = 0; repeat < 2; repeat++) {
    const response = await POST(
      new Request("http://localhost/api/session/demo", {
        method: "POST",
        body: "{}",
        headers: { "x-request-id": "pr22b-demo" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("pr22b-demo");
    const data: { examples: Example[] } = await response.json();
    expect(Object.keys(data)).toEqual(["examples"]);
    expect(data.examples).toHaveLength(3);
    for (const [index, [judge, externalId, title, locale, directory]] of fixtures.entries()) {
      expect(data.examples[index]).toEqual({
        problemId: expect.any(String),
        judge,
        externalId,
        title,
        locale,
        code: readFileSync(`docs/examples/${directory}/student.cpp`, "utf8"),
      });
      expect(data.examples[index].code.trim().length).toBeGreaterThan(0);
    }
  }
  expect((await store.db.select().from(users)).filter((u) => u.isGuest)).toMatchObject([
    { handle: "guest_local" },
  ]);
});
it("attempt creation honors the demo locale cookie without changing the shared guest", async () => {
  const [problem] = await store.db.query.problems.findMany();
  const response = await createHandlers({ db: async () => store.db }).attempt(
    new Request("http://localhost/api/attempts", {
      method: "POST",
      headers: { cookie: "other=1; daleel_locale=ar-EG" },
      body: JSON.stringify({ problemId: problem.id, language: "cpp17", code: "demo code" }),
    }),
  );
  expect(response.status).toBe(200);
  expect(await store.db.select().from(attempts)).toMatchObject([{ locale: "ar-EG" }]);
});
