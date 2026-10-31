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
    steps: ["Diagnose", "Verify", "Hint"],
  },
  {
    selected: "ar-EG",
    preview: "لسه بنبني النسخة الأولى.",
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
