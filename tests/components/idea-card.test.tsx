import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { attemptDetail } from "@/src/services/attempt-service";
import fixture from "@/tests/fixtures/llm/idea-ladder.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
async function components() {
  expect(
    existsSync("src/components/idea-card.tsx"),
    "The idea workspace and code-free intake action are missing",
  ).toBe(true);
  return import("@/src/components/idea-card");
}
const detail = (
  locale: "en" | "ar-EG",
  revealed = 0,
): Awaited<ReturnType<typeof attemptDetail>> => ({
  attempt: {
    id: "idea-1",
    mode: "idea",
    problemId: "problem-1",
    parentAttemptId: null,
    language: "cpp17",
    code: "",
    verdictReported: null,
    verdictTestNo: null,
    studentNote: null,
    locale,
    status: "new",
    maxHintLevel: revealed,
    solvedAt: null,
    createdAt: 0,
  },
  problem: undefined,
  revealedHints: fixture.levels.slice(0, revealed),
  canExplain: revealed >= 3,
  replay: false,
  recordedAt: null,
});
it.each(["en", "ar-EG"] as const)(
  "shows idea hints, a reveal button and paste-code link without diagnosis/editor/explanation in %s",
  async (locale) => {
    const { IdeaCard } = await components();
    const html = renderToStaticMarkup(<IdeaCard detail={detail(locale)} locale={locale} />);
    expect(html).toContain(
      locale === "en" ? "Find the idea step by step" : "يلا نلاقي الفكرة خطوة بخطوة",
    );
    expect(html).toContain(`dir="${locale === "en" ? "ltr" : "rtl"}"`);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>[\s\S]*?(Hint|الـ hint) 1<\/button>/);
    expect(html).toContain('href="/problem?problemId=problem-1"');
    expect(html).toContain(locale === "en" ? "I have code now, check it" : "كتبت كود؟ يلا نشوفه");
    const complete = renderToStaticMarkup(<IdeaCard detail={detail(locale, 4)} locale={locale} />);
    expect(complete).toContain('data-hint-level="4"');
    expect(complete).not.toMatch(
      /cm-editor|attempt-code-label|Attempt progress|Full explanation|fixed_recheck|recheck-code-label|<button/,
    );
    const page = readFileSync("app/attempt/[id]/page.tsx", "utf8");
    expect(page).toMatch(/detail\.attempt\.mode === "idea"/);
    expect(page).toContain("<IdeaCard");
  },
);
it.each(["en", "ar-EG"] as const)(
  "renders an enabled secondary idea button with empty code and posts idea mode in %s",
  async (locale) => {
    const { IdeaStartButton } = await components();
    const { startIdeaAttempt } = await import("@/src/services/intake-client");
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ attemptId: "idea-1" }),
    );
    vi.stubGlobal("fetch", fetch);
    const push = vi.fn();
    const button = IdeaStartButton({
      locale,
      busy: false,
      onClick: () => startIdeaAttempt("problem-1", push),
    });
    const html = renderToStaticMarkup(button);
    expect(html).toContain(
      locale === "en" ? "I don&#x27;t know where to start" : "مش عارف أبدأ منين",
    );
    expect(html).toMatch(/<button[^>]*type="button"[^>]*class="[^"]*button-secondary/);
    expect(html).not.toContain("disabled");
    await button.props.onClick();
    expect(fetch).toHaveBeenCalledWith(
      "/api/attempts",
      expect.objectContaining({ body: JSON.stringify({ problemId: "problem-1", mode: "idea" }) }),
    );
    expect(push).toHaveBeenCalledWith("/attempt/idea-1");
    const page = readFileSync("app/problem/page.tsx", "utf8");
    expect(page).toContain("<IdeaStartButton");
    expect(page).toContain("preloadProblem");
    expect(page).toContain("startIdeaAttempt");
  },
);
