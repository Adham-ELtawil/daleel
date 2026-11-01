import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { t } from "@/src/i18n";

let pathname = "/";
let locale: "en" | "ar-EG" = "en";
vi.mock("@/app/globals.css", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: locale }) }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => pathname,
}));
afterEach(() => vi.unstubAllGlobals());

it.each(["en", "ar-EG"] as const)(
  "renders the shared language toggle and page attributes in %s",
  async (selected) => {
    locale = selected;
    // Supply the classic JSX runtime used by the test transform.
    vi.stubGlobal("React", React);
    const { default: RootLayout } = await import("@/app/layout");
    const html = renderToStaticMarkup(await RootLayout({ children: React.createElement("main") }));
    expect(html).toContain(
      `<html lang="${selected === "en" ? "en" : "ar"}" dir="${selected === "en" ? "ltr" : "rtl"}">`,
    );
    expect(html).toMatch(/<header[\s\S]*<button[\s\S]*<\/header>[\s\S]*<main/);
    expect(html).toContain(`aria-label="${t("ui_language", selected)}"`);
    expect(html).toContain(selected === "en" ? "عربي" : "English");
  },
);
it.each(
  (["en", "ar-EG"] as const).flatMap((selected) =>
    ["/", "/problem", "/me", "/attempt/pr14-attempt"].map((pathname) => ({ selected, pathname })),
  ),
)(
  "switches from $selected on $pathname, fetching hints in the target locale before refreshing",
  async ({ selected, pathname }) => {
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
  },
);
it("refreshes the page if fetching the target hints fails", async () => {
  vi.stubGlobal("document", { cookie: "" });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const refresh = vi.fn();
  const { switchUiLocale } = await import("@/src/components/locale-shell");
  await switchUiLocale("en", "/attempt/pr14-attempt", refresh);
  expect(refresh).toHaveBeenCalledOnce();
});

it.each(["en", "ar-EG"] as const)(
  "keeps brand, navigation and toggle in logical order in %s",
  async (selected) => {
    locale = selected;
    vi.stubGlobal("React", React);
    const { default: RootLayout } = await import("@/app/layout");
    const html = renderToStaticMarkup(await RootLayout({ children: null }));
    const header = html.match(/<header\b[\s\S]*?<\/header>/)?.[0] ?? "";
    expect(header).toMatch(/<a[^>]*href="\/"[^>]*>[\s\S]*<svg\b[^>]*aria-hidden="true"/);
    expect(header).toContain(t("title", selected, "landing"));
    const nav = header.match(/<nav\b[^>]*aria-label="[^"]+"[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect([...nav.matchAll(/href="([^"]+)"/g)].map((match) => match[1])).toEqual([
      "/problem",
      "/me",
      "/coach",
    ]);
    expect(header).toMatch(/<\/nav><button[^>]*class="[^"]*\bms-auto\b/);
    expect(header).not.toContain("flex-row-reverse");
  },
);
it.each(["en", "ar-EG"] as const)(
  "publishes localized Open Graph metadata in %s",
  async (selected) => {
    locale = selected;
    const { generateMetadata } = await import("@/app/layout");
    expect(await generateMetadata()).toMatchObject({
      title: t("title", selected, "landing"),
      description: t("description", selected, "landing"),
      openGraph: {
        type: "website",
        title: t("title", selected, "landing"),
        description: t("description", selected, "landing"),
        siteName: t("title", selected, "landing"),
        locale: selected === "en" ? "en_US" : "ar_EG",
      },
    });
  },
);
it("provides an SVG favicon without the scaffold icon or external assets", () => {
  expect(existsSync("app/icon.svg"), "The branded SVG favicon is missing").toBe(true);
  const svg = readFileSync("app/icon.svg", "utf8");
  expect(svg).toMatch(/<svg\b[^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  expect(svg).not.toMatch(/<(?:script|image)\b|\bhref=/);
  expect(existsSync("app/favicon.ico")).toBe(false);
});

it.each(["/problem", "/me", "/coach", "/coach/report"])(
  "marks the current navigation link on %s",
  async (path) => {
    pathname = path;
    vi.stubGlobal("React", React);
    const { LocaleShell } = await import("@/src/components/locale-shell");
    const html = renderToStaticMarkup(<LocaleShell locale="en">{null}</LocaleShell>);
    const current = [...html.matchAll(/<a\b[^>]*aria-current="page"[^>]*>/g)];
    expect(current).toHaveLength(1);
    expect(current[0][0]).toContain(`href="${path.startsWith("/coach") ? "/coach" : path}"`);
  },
);
