import React from "react";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import a from "@/tests/fixtures/llm/explanation-a.json";
import { HintLadder } from "@/src/components/hint-ladder";
import type { attemptDetail } from "@/src/services/attempt-service";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => vi.unstubAllGlobals());

async function render(complexity_note: string | null = a.complexity_note) {
  const path = resolve("src/components/explanation.tsx");
  expect(existsSync(path), "Full explanation rendering is missing").toBe(true);
  const { Explanation } = (await import(path)) as typeof import("@/src/components/explanation");
  return renderToStaticMarkup(
    React.createElement(Explanation, {
      explanation: {
        ...a,
        explanation_md: "Check `w`\n\n<script>unsafe</script>",
        complexity_note,
      },
      trace: a.trace,
      code: "int w;",
      locale: "en",
    }),
  );
}
it("uses SafeMd, shows a small LTR diff of the student's own lines and the complexity note", async () => {
  const html = await render();
  expect(html).toContain('<code dir="ltr" class="bidi-isolate">w</code>');
  expect(html).toContain("&lt;script&gt;unsafe&lt;/script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toContain("Line 6");
  expect(html).toMatch(/<li[^>]*dir="ltr"/);
  expect(html).toContain("if (w % 2 == 0) cout &lt;&lt; &quot;YES&quot;;");
  expect(html).toContain("if (w % 2 == 0 &amp;&amp; w &gt; 2) cout &lt;&lt; &quot;YES&quot;;");
  expect(html).toContain(a.complexity_note);
  expect(html).toContain("Walkthrough");
});
it("omits the complexity section when the API returns null", async () => {
  expect(await render(null)).not.toContain("Complexity");
});
it("anchors the flat explanation and distinguishes removed and added lines", async () => {
  const html = await render();
  expect(html).toMatch(/<article[^>]*id="explanation"[^>]*class="[^"]*scroll-mt-24/);
  expect(html).toMatch(/<del[^>]*class="[^"]*bg-danger\/12[^"]*text-danger/);
  expect(html).toMatch(/<ins[^>]*class="[^"]*bg-success\/12[^"]*text-success/);
});
it.each(["en", "ar-EG"] as const)("only offers the explanation when canExplain in %s", (locale) => {
  vi.stubGlobal("React", React);
  const detail: Awaited<ReturnType<typeof attemptDetail>> = {
    attempt: {
      mode: "code",
      id: "pr18-attempt",
      problemId: "cf-4A",
      parentAttemptId: null,
      language: "cpp17",
      code: "int w;",
      verdictReported: null,
      verdictTestNo: null,
      studentNote: null,
      locale,
      status: "stuck",
      maxHintLevel: 0,
      solvedAt: null,
      createdAt: 0,
    },
    problem: undefined,
    revealedHints: [],
    canExplain: false,
    replay: false,
    recordedAt: null,
  };
  const label = locale === "en" ? "Full explanation" : "الشرح الكامل";
  expect(
    renderToStaticMarkup(React.createElement(HintLadder, { detail, locale, ready: false })),
  ).not.toContain(label);
  expect(
    renderToStaticMarkup(
      React.createElement(HintLadder, {
        detail: { ...detail, canExplain: true },
        locale,
        ready: false,
      }),
    ),
  ).toContain(label);
});
