import React from "react";
import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { t } from "@/src/i18n";

async function feedback() {
  expect(
    existsSync("src/components/attempt-feedback.tsx"),
    "Attempt feedback cards and skeletons are missing",
  ).toBe(true);
  return import("@/src/components/attempt-feedback");
}
it.each(["en", "ar-EG"] as const)(
  "announces a loading skeleton without reading decorative bars in %s",
  async (locale) => {
    const { LoadingSkeleton } = await feedback();
    const html = renderToStaticMarkup(<LoadingSkeleton label={t("thinking", locale)} />);
    expect(html).toContain(t("thinking", locale));
    expect(html).toMatch(/role="status"[^>]*aria-busy="true"/);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("skeleton-line");
  },
);
it.each(["budget_reached", "llm_error", "contest_running"] as const)(
  "renders a localized, actionable error card for %s",
  async (code) => {
    const { DiagnosisError } = await feedback();
    for (const locale of ["en", "ar-EG"] as const) {
      const html = renderToStaticMarkup(<DiagnosisError code={code} locale={locale} />);
      expect(html).toContain(renderToStaticMarkup(<p>{t(code, locale)}</p>));
      expect(html).toMatch(/role="alert"[^>]*class="[^"]*state-panel/);
      expect(html).toContain("<h2");
      expect(html).not.toContain(code);
    }
  },
);
