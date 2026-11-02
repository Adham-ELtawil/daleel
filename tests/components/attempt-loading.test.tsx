import React from "react";
import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

let locale: "en" | "ar-EG" = "en";
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: locale }) }),
  headers: async () => new Headers(),
}));
afterEach(() => vi.unstubAllGlobals());
it.each([
  ["en", "Preparing in your language…", "ltr"],
  ["ar-EG", "بنجهّز الكلام بلغتك…", "rtl"],
] as const)("shows the server loading skeleton in %s", async (selected, label, dir) => {
  locale = selected;
  vi.stubGlobal("React", React);
  expect(existsSync("app/attempt/[id]/loading.tsx"), "Attempt loading boundary is missing").toBe(
    true,
  );
  const { default: Loading } = await import("@/app/attempt/[id]/loading");
  const html = renderToStaticMarkup(await Loading());
  expect(html).toContain(label);
  expect(html).toContain(`dir="${dir}"`);
  expect(html).toMatch(/role="status"[^>]*aria-busy="true"/);
  expect(html.match(/skeleton-line/g)).toHaveLength(3);
});
