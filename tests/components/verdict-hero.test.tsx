import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());
it.each(["en", "ar-EG"] as const)(
  "shows the real 1A verdict and accessible final hint in %s",
  async (locale) => {
    const path = resolve("src/components/verdict-hero.tsx");
    expect(existsSync(path), "The verdict hero behavior is missing").toBe(true);
    vi.stubGlobal("React", React);
    const { VerdictHero } = (await import(path)) as typeof import("@/src/components/verdict-hero");
    const html = renderToStaticMarkup(<VerdictHero locale={locale} />);
    expect(html).toMatch(/<section[^>]*aria-label="[^"]+"/);
    expect(html).toContain('data-motion="verdict"');
    expect(html).toMatch(/<pre[^>]*dir="ltr"/);
    const lines = [
      ...html.matchAll(/<span[^>]*data-line="(\d+)"[^>]*>([\s\S]*?)<\/code><\/span>/g),
    ];
    const code = lines.map((match) =>
      match[2]
        .split("<code")[1]
        ?.replace(/^[^>]*>/, "")
        .replace(/<[^>]*>/g, "")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">"),
    );
    expect(code.join("\n") + "\n").toBe(
      readFileSync("docs/examples/cf-1A-theatre-square/student.cpp", "utf8"),
    );
    expect(html).toMatch(/data-line="8"[^>]*class="[^"]*hero-wrong-line/);
    for (const value of ["1000000000 1000000000 1", "1000000000000000000", "-1486618624"]) {
      expect(html).toMatch(new RegExp(`<code[^>]*dir="ltr"[^>]*>${value}</code>`));
    }
    expect(html).toMatch(
      /<p dir="ltr" class="[^"]*hero-verdict[^"]*font-mono[^"]*"><span aria-hidden="true">✗ <\/span>Wrong answer<\/p>/,
    );
    expect(html.match(/<dt class="[^"]*font-sans[^"]*text-start[^"]*"/g)).toHaveLength(3);
    expect(html).not.toMatch(/test\s*\d/i);
    expect(html).toContain(
      locale === "en" ? "The answer can reach 10^18." : "الإجابة ممكن توصل لـ 10^18.",
    );
    expect(html).not.toContain("aria-live=");
    expect(html).toMatch(/<button[^>]*class="[^"]*hero-replay[^>]*>/);
    expect(html).toContain(locale === "en" ? "Replay" : "اعرضها تاني");
  },
);
it("provides a final-state reduced-motion fallback and an RTL hint wipe", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const reduce = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  expect(reduce).toContain('[data-motion="verdict"]');
  expect(reduce).toContain("animation: none");
  expect(reduce).toMatch(/\.hero-replay[^{]*\{[^}]*display:\s*none/);
  expect(reduce).toContain(".hero-running");
  expect(css).toMatch(/:dir\(rtl\)[^{]*\{[^}]*animation-name:\s*hero-wipe-rtl/);
});
