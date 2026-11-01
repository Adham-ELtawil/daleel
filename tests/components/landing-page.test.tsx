import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

let locale: "en" | "ar-EG" = "en";
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: locale }) }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => vi.unstubAllGlobals());

async function render(selected: "en" | "ar-EG") {
  locale = selected;
  vi.stubGlobal("React", React);
  const { default: Home } = await import("@/app/page");
  return renderToStaticMarkup(await Home());
}

const locales = [
  {
    selected: "en",
    preview: "Early preview: the coach is under construction.",
    headline: "Wrong answer? Find out why, then fix it yourself.",
    eyebrow: "Your competitive programming coach",
    steps: ["Diagnose", "Verify", "Hint"],
  },
  {
    selected: "ar-EG",
    preview: "لسه بنبني النسخة الأولى.",
    headline: "الكود طلع Wrong answer؟ اعرف السبب وصلّحه بنفسك.",
    eyebrow: "كوتشك في الـ competitive programming",
    steps: ["شخّص", "اتأكد", "خد تلميح"],
  },
] as const;

it.each(locales)(
  "removes the under-construction copy in $selected",
  async ({ selected, preview }) => {
    const html = await render(selected);
    expect(html).not.toContain(preview);
    expect(html).toContain('href="/problem"');
    expect(html).toContain('id="demo-heading"');
  },
);

it.each(locales)("explains the three steps in order in $selected", async ({ selected, steps }) => {
  const html = await render(selected);
  const list = html.match(/<ol\b[\s\S]*?<\/ol>/)?.[0] ?? "";
  const headings = [...list.matchAll(/<h3\b[^>]*>([^<]+)<\/h3>/g)].map((match) => match[1]);
  expect(headings).toEqual(steps);
  expect(list.match(/<li\b/g)).toHaveLength(3);
});

it.each(locales)(
  "shows the verdict message and functional CTAs in $selected",
  async ({ selected, headline, eyebrow }) => {
    const html = await render(selected);
    const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "";
    expect(heading.replace(/<[^>]*>/g, "")).toBe(headline);
    expect(heading).toMatch(/<bdi dir="ltr" class="whitespace-nowrap">Wrong answer<\/bdi>/);
    expect(html).toContain('href="/problem"');
    expect(html).toContain('href="#demo"');
    expect(html).toContain('id="demo"');
    expect(html).toContain('id="demo-heading"');
    expect(html).toContain('href="/coach"');
    expect(html).not.toContain(eyebrow);
  },
);
