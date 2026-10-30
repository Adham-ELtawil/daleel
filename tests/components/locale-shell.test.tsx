import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { t } from "@/src/i18n";

let locale: "en" | "ar-EG" = "en";
vi.mock("@/app/globals.css", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: locale }) }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => vi.unstubAllGlobals());

it.each(["en", "ar-EG"] as const)("renders the shared language toggle and page attributes in %s", async (selected) => {
  locale = selected;
  // Supply the classic JSX runtime used by the test transform.
  vi.stubGlobal("React", React);
  const { default: RootLayout } = await import("@/app/layout");
  const html = renderToStaticMarkup(await RootLayout({ children: React.createElement("main") }));
  expect(html).toContain(`<html lang="${selected === "en" ? "en" : "ar"}" dir="${selected === "en" ? "ltr" : "rtl"}">`);
  expect(html).toMatch(/<header[\s\S]*<button[\s\S]*<\/header>[\s\S]*<main/);
  expect(html).toContain(`aria-label="${t("ui_language", selected)}"`);
  expect(html).toContain(t(selected === "en" ? "arabic" : "english", selected));
});
it.each((["en", "ar-EG"] as const).flatMap((selected) =>
  ["/", "/problem", "/me", "/attempt/pr14-attempt"].map((pathname) => ({ selected, pathname })),
))("switches from $selected on $pathname, fetching hints in the target locale before refreshing", async ({ selected, pathname }) => {
  const document = { cookie: "" };
  const fetch = vi.fn(async () => new Response("{}"));
  const refresh = vi.fn();
  vi.stubGlobal("document", document);
  vi.stubGlobal("fetch", fetch);
  const shell = await import("@/src/components/locale-shell");
    const target = selected === "en" ? "ar-EG" : "en";
    await shell.switchUiLocale(selected, pathname, refresh);
    expect(document.cookie).toBe(`daleel_locale=${target}; Path=/; Max-Age=31536000; SameSite=Lax`);
    if (pathname.startsWith("/attempt/")) {
      expect(fetch).toHaveBeenCalledWith(`/api/attempts/pr14-attempt?locale=${target}`);
      expect(fetch.mock.invocationCallOrder[0]).toBeLessThan(refresh.mock.invocationCallOrder[0]);
    } else expect(fetch).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
});
it("refreshes the page if fetching the target hints fails", async () => {
  vi.stubGlobal("document", { cookie: "" });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const refresh = vi.fn();
  const { switchUiLocale } = await import("@/src/components/locale-shell");
  await switchUiLocale("en", "/attempt/pr14-attempt", refresh);
  expect(refresh).toHaveBeenCalledOnce();
});
