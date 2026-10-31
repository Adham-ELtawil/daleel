import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import a from "@/tests/fixtures/llm/explanation-a.json";
import b from "@/tests/fixtures/llm/explanation-b.json";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";
import type { Explanation } from "@/src/llm/schemas/explanation";

const code = readFileSync("docs/examples/cf-4A-watermelon/student.cpp", "utf8");
async function render(
  trace: Explanation["trace"] = a.trace,
  initialIndex = 0,
  locale: "en" | "ar-EG" = "en",
) {
  const path = resolve("src/components/walkthrough.tsx");
  expect(existsSync(path), "Walkthrough frame rendering is missing").toBe(true);
  const { Walkthrough } = (await import(path)) as typeof import("@/src/components/walkthrough");
  return renderToStaticMarkup(
    React.createElement(Walkthrough, { trace, code, locale, initialIndex }),
  );
}
it("renders the caption, read-only numbered student code and highlighted current line", async () => {
  const html = await render();
  expect(html).toContain(a.trace.frames[0].caption);
  expect(html).not.toContain(a.trace.frames[1].caption);
  expect(html).toMatch(/data-code-line="5"[^>]*data-active="true"/);
  expect(html).toContain("cin &gt;&gt; w;");
  expect(html).toMatch(/<pre[^>]*dir="ltr"/);
  expect(html).not.toMatch(/<textarea|contenteditable="true"/);
  expect(html).toMatch(/<strong[^>]*>2<\/strong>/);
});
it("renders highlighted array cells and pointer labels under their target cells", async () => {
  const trace: Explanation["trace"] = structuredClone(a.trace);
  trace.frames[2].arrays[0].pointers = [{ name: "i", index: 1 }];
  const html = await render(trace, 2);
  expect(html).toMatch(/dir="ltr"[^>]*data-array="parts"/);
  expect(html).toMatch(/data-array-cell="0"[^>]*data-highlighted="true"/);
  expect(html).toMatch(/data-array-cell="1"[^>]*data-highlighted="true"[\s\S]*data-pointer="i"/);
  expect(html).not.toContain("<strong>2</strong>");
});
it.each([a, b].flatMap((fixture) => ["en", "ar-EG"].map((locale) => ({ fixture, locale }))))(
  "renders the final input and expected versus student output for each fixture and locale",
  async ({ fixture, locale }) => {
    const html = await render(
      fixture.trace,
      fixture.trace.frames.length - 1,
      locale as "en" | "ar-EG",
    );
    expect(html).toContain(fixture.trace.frames.at(-1)!.caption);
    expect(
      [...html.matchAll(/<pre[^>]*dir="ltr"[^>]*>([^<]*)<\/pre>/g)].map((match) => match[1]),
    ).toEqual([fixture.trace.input, fixture.trace.expected_output, fixture.trace.student_output]);
    expect(html).toContain(locale === "en" ? "Your output" : "الـ output بتاعك");
    expect(html).toContain(`dir="${locale === "en" ? "ltr" : "rtl"}"`);
  },
);
it("escapes untrusted frame text and source code", async () => {
  const trace = structuredClone(a.trace);
  trace.frames[0].caption = "<script>frame</script>";
  trace.frames[0].vars[0].value = "<img src=x>";
  const html = await render(trace);
  expect(html).toContain("&lt;script&gt;frame&lt;/script&gt;");
  expect(html).toContain("&lt;img src=x&gt;");
  expect(html).not.toContain("<script>");
});
it("provides labeled controls and keeps their direction consistent in RTL", async () => {
  const html = await render(a.trace, 0, "ar-EG");
  expect(html).toMatch(/dir="ltr"[^>]*data-controls/);
  expect(html).toContain('aria-keyshortcuts="ArrowLeft ArrowRight Space"');
  expect(html).toMatch(/<input[^>]*type="range"[^>]*aria-label="[^\"]+"/);
  expect(html).toMatch(/<select[^>]*aria-label="[^\"]+"/);
  for (const value of ["0.5", "1", "2"]) expect(html).toContain(`value="${value}"`);
});
it("has complete walkthrough translations and Arabic-first copy", () => {
  const keys = [
    "title",
    "full_explanation",
    "fix",
    "line",
    "complexity",
    "previous",
    "next",
    "play",
    "pause",
    "speed",
    "slow",
    "normal",
    "fast",
    "frame",
    "variables",
    "name",
    "value",
    "load_error",
  ];
  for (const messages of [en, ar]) {
    expect(messages).toHaveProperty("walkthrough");
    const dictionary: Record<string, string> = (
      messages as unknown as { walkthrough: Record<string, string> }
    ).walkthrough;
    expect(Object.keys(dictionary).sort()).toEqual([...keys].sort());
    for (const text of Object.values(dictionary)) expect(text.trim()).not.toBe("");
  }
  const dictionary = (ar as unknown as { walkthrough: Record<string, string> }).walkthrough;
  for (const text of Object.values(dictionary)) {
    expect(text).toMatch(/^[\u0600-\u06ff]/);
    expect(text).not.toMatch(/[()\/→←]/);
  }
});
