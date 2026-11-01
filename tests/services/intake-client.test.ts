import { existsSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import base from "@/src/db/seed-fixtures/problems.json";

afterEach(() => vi.unstubAllGlobals());
async function client() {
  expect(
    existsSync("src/services/intake-client.ts"),
    "Intake idea creation and problem preloading are missing",
  ).toBe(true);
  return import("@/src/services/intake-client");
}
it("POSTs only problemId and mode idea then navigates to the attempt", async () => {
  const { startIdeaAttempt } = await client();
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ attemptId: "idea-1" }));
  vi.stubGlobal("fetch", fetch);
  const push = vi.fn();
  await startIdeaAttempt("problem-1", push);
  expect(fetch).toHaveBeenCalledWith(
    "/api/attempts",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ problemId: "problem-1", mode: "idea" }),
    }),
  );
  expect(push).toHaveBeenCalledWith("/attempt/idea-1");
});
it("GETs a saved problem by its encoded id for code intake", async () => {
  const { preloadProblem } = await client();
  const problem = { ...base[0], id: "problem-1" };
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ problem }));
  vi.stubGlobal("fetch", fetch);
  expect(await preloadProblem("problem/1")).toEqual(problem);
  expect(fetch).toHaveBeenCalledWith("/api/problems/problem%2F1");
});
it("propagates intake errors for the existing localized error UI without navigating", async () => {
  const { startIdeaAttempt, preloadProblem } = await client();
  vi.stubGlobal("fetch", async () =>
    Response.json({ error: { code: "contest_running" } }, { status: 423 }),
  );
  const push = vi.fn();
  await expect(startIdeaAttempt("problem-1", push)).rejects.toMatchObject({
    status: 423,
    code: "contest_running",
  });
  await expect(preloadProblem("problem-1")).rejects.toMatchObject({
    status: 423,
    code: "contest_running",
  });
  expect(push).not.toHaveBeenCalled();
});
