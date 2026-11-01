import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AttemptStepper } from "@/src/components/attempt-steps";
import { HintLadder } from "@/src/components/hint-ladder";
import type { attemptDetail } from "@/src/services/attempt-service";
import hints from "@/tests/fixtures/llm/idea-ladder.json";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";
import ProblemPage from "@/app/problem/page";

const request = vi.hoisted(() => ({ locale: "en" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: request.locale }) }),
  headers: async () => new Headers(),
}));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
it("offers a primary resolve action and a clickable paste fallback before resolution", () => {
  const html = renderToStaticMarkup(<ProblemPage />);
  expect(html).toMatch(/<button[^>]*class="[^"]*button-primary[^>]*>Resolve<\/button>/);
  expect(html).toMatch(/<button[^>]*class="[^"]*text-button[^>]*>Paste the statement<\/button>/);
});
type OutputProps = {
  rows: { label: string; value: string; tone?: "expected" | "got" }[];
  verdict?: string;
  animate?: boolean;
};
async function output() {
  const path = resolve("src/components/ui/judge-output.tsx");
  expect(existsSync(path), "Shared judge output is missing").toBe(true);
  return (await import(path)) as { JudgeOutput: React.ComponentType<OutputProps> };
}
it.each(["en", "ar-EG"] as const)(
  "renders sans labels and isolated judge values in %s",
  async (locale) => {
    const { JudgeOutput } = await output();
    const copy = locale === "en" ? en.hero : ar.hero;
    const html = renderToStaticMarkup(
      <JudgeOutput
        verdict={copy.verdict}
        animate
        rows={[
          { label: copy.input, value: "2\n" },
          { label: copy.expected, value: "NO\n", tone: "expected" },
          { label: copy.got, value: "YES\n", tone: "got" },
        ]}
      />,
    );
    expect(html.match(/<dt[^>]*class="[^"]*font-sans/g)).toHaveLength(3);
    expect(
      html.match(/<dd[^>]*dir="ltr"[^>]*class="[^"]*bidi-isolate[^"]*font-mono/g),
    ).toHaveLength(3);
    expect(html).toMatch(/<dd[^>]*text-success[^>]*>[\s\S]*?NO/);
    expect(html).toMatch(/<dd[^>]*text-danger[^>]*>[\s\S]*?YES/);
    expect(html).toContain("verdict-wipe");
    expect(html.match(/<pre[^>]*class="[^"]*whitespace-pre"/g)).toHaveLength(3);
    expect(html).not.toContain("whitespace-pre-wrap");
  },
);
it("keeps official sample outputs neutral and escapes their contents", async () => {
  const { JudgeOutput } = await output();
  const html = renderToStaticMarkup(
    <JudgeOutput rows={[{ label: en.intake.output, value: "<script>sample</script>" }]} />,
  );
  expect(html).not.toMatch(/text-success|text-danger|<script>/);
  expect(html).toContain("&lt;script&gt;sample&lt;/script&gt;");
});
it("frames a window with a title and end action", async () => {
  const path = resolve("src/components/ui/window.tsx");
  expect(existsSync(path), "Shared editor window is missing").toBe(true);
  const { Window } = (await import(path)) as {
    Window: React.ComponentType<{
      title: React.ReactNode;
      action?: React.ReactNode;
      children: React.ReactNode;
    }>;
  };
  const html = renderToStaticMarkup(
    <Window title={en.hero.file} action={<button>{en.hero.replay}</button>}>
      <pre dir="ltr">{"int n;"}</pre>
    </Window>,
  );
  expect(html).toContain("editor-window");
  expect(html).toContain("window-title");
  expect(html).toContain("ms-auto");
});
it.each(["en", "ar-EG"] as const)(
  "uses the state-derived rail as the content container in %s",
  (locale) => {
    const html = renderToStaticMarkup(
      <AttemptStepper
        locale={locale}
        complete={[true, true, false, false]}
        {...{
          children: [
            <p key="1">{en.intake.code}</p>,
            <p key="2">{en.hero.expected}</p>,
            <p key="3">{en.hero.hint}</p>,
            <p key="4">{en.walkthrough.complexity}</p>,
          ],
        }}
      />,
    );
    expect(html).toContain("attempt-rail");
    const nodes = [...html.matchAll(/<li\b[\s\S]*?<\/li>/g)].map(([node]) => node);
    expect(nodes).toHaveLength(4);
    [en.intake.code, en.hero.expected, en.hero.hint, en.walkthrough.complexity].forEach(
      (text, index) => expect(nodes[index]).toContain(text),
    );
    expect(nodes[0]).toContain('data-state="complete"');
    expect(nodes[2]).toContain('aria-current="step"');
    expect(nodes[3]).toContain('data-state="pending"');
  },
);
it("expands hint rows with a reduced-motion contract and keyboard focus target", () => {
  const detail: Awaited<ReturnType<typeof attemptDetail>> = {
    attempt: {
      id: "idea",
      mode: "idea",
      problemId: "problem",
      parentAttemptId: null,
      language: "cpp17",
      code: "",
      verdictReported: null,
      verdictTestNo: null,
      studentNote: null,
      locale: "en",
      status: "new",
      maxHintLevel: 1,
      solvedAt: null,
      createdAt: 0,
    },
    problem: undefined,
    revealedHints: hints.levels.slice(0, 1),
    canExplain: false,
    replay: false,
    recordedAt: null,
  };
  const html = renderToStaticMarkup(<HintLadder detail={detail} locale="en" ready />);
  expect(html).toMatch(/data-hint-level="1"[^>]*tabindex="-1"/);
  expect(html).toContain("hint-row");
  expect(html).toContain("hint-expand");
  expect(html).toContain('aria-live="polite"');
  const toolbar = renderToStaticMarkup(
    <HintLadder
      detail={{ ...detail, attempt: { ...detail.attempt, mode: "code" } }}
      locale="en"
      ready
    />,
  );
  expect(toolbar.match(/class="button button-secondary button-small"/g)).toHaveLength(3);
  expect(toolbar).toMatch(/class="button button-primary"[^>]*>Hint 2<\/button>/);
  const css = readFileSync("app/globals.css", "utf8");
  expect(css).toMatch(/\.hint-expand\s*\{[^}]*grid-template-rows:\s*0fr;[^}]*200ms/);
  const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  for (const name of [".hint-expand", ".skeleton-line", ".verdict-wipe"])
    expect(reduced).toContain(name);
  expect(reduced).toContain("animation: none");
  expect(reduced).toContain("transition: none");
});
it.each(["en", "ar-EG"] as const)(
  "renders localized not-found copy and navigation in %s",
  async (locale) => {
    request.locale = locale;
    const path = resolve("app/not-found.tsx");
    expect(existsSync(path), "Localized not-found page is missing").toBe(true);
    const { default: Page } = (await import(path)) as {
      default: () => Promise<React.ReactElement>;
    };
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("404");
    expect(html.match(/404/g)).toHaveLength(1);
    expect(html).toContain("404 Not found");
    expect(html).toMatch(/<bdi[^>]*dir="ltr"[^>]*class="font-mono">Daleel<\/bdi>/);
    expect(html).toContain("text-start");
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/problem"');
    expect(html).toContain(
      locale === "en"
        ? "This page doesn&#x27;t exist, or the attempt belongs to another session."
        : "الصفحة دي مش موجودة، أو المحاولة تبع جلسة تانية.",
    );
    expect(html).toContain(`dir="${locale === "en" ? "ltr" : "rtl"}"`);
  },
);
it("removes arrows from all button copy and keeps i18n parity", () => {
  expect(JSON.stringify(en)).not.toContain("→");
  expect(JSON.stringify(ar)).not.toContain("→");
  for (const scope of Object.keys(en) as (keyof typeof en)[])
    expect(Object.keys(ar[scope])).toEqual(Object.keys(en[scope]));
});
