import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "ar-EG" }) }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

it("defines a still frame for every feature icon so reduced motion shows a whole pose", async () => {
  const { featureIcons } = await import("@/src/stickers/icons");
  expect(Object.keys(featureIcons).sort()).toEqual(["coach", "counterexample", "diagnose", "hints"]);
  for (const icon of Object.values(featureIcons)) {
    expect(icon.still).toBeTypeOf("number");
    expect(icon.still!).toBeLessThan(icon.frames);
  }
});

it("renders a fixed-size decorative sticker per homepage feature", async () => {
  vi.stubGlobal("React", React);
  const { default: Home } = await import("@/app/page");
  const html = renderToStaticMarkup(await Home());
  for (const name of ["diagnose", "counterexample", "hints", "coach"])
    expect(html).toMatch(new RegExp(`<span[^>]*data-sticker="${name}"[^>]*aria-hidden="true"|<span[^>]*aria-hidden="true"[^>]*data-sticker="${name}"`));
  expect(html.match(/class="feature-sticker[^"]*"/g)).toHaveLength(4);
  vi.unstubAllGlobals();
});
