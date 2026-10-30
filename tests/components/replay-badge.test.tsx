import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

async function badge(replay: boolean, locale: "en" | "ar-EG", recordedAt: string | null) {
  const path = resolve("src/components/replay-badge.tsx");
  expect(existsSync(path), "The replay provenance badge is missing").toBe(true);
  const {
    ReplayBadge,
  }: {
    ReplayBadge: ComponentType<{
      replay: boolean;
      locale: "en" | "ar-EG";
      recordedAt: string | null;
    }>;
  } = await import(path);
  return renderToStaticMarkup(createElement(ReplayBadge, { replay, locale, recordedAt }));
}
it.each([
  ["en", "Replay (recorded 2026-10-30)"],
  ["ar-EG", "إعادة تشغيل من تسجيل بتاريخ 2026-10-30"],
] as const)("shows the recording's date in %s", async (locale, text) => {
  expect(await badge(true, locale, "2026-10-30T12:16:27.160Z")).toContain(text);
});
it("hides the badge for live results or absent provenance", async () => {
  expect(await badge(false, "en", "2026-10-30T12:16:27.160Z")).toBe("");
  expect(await badge(true, "en", null)).toBe("");
});
