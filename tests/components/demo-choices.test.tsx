import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

it.each(["en", "ar-EG"] as const)(
  "shows a problem code, neutral language chip and start action in %s",
  async (locale) => {
    vi.stubGlobal("React", React);
    const component = await import("@/src/components/demo-choices");
    expect(component, "Demo rows need a problem code and a start action").toHaveProperty(
      "DemoChoiceRow",
    );
    const { DemoChoiceRow } = component;
    for (const [judge, externalId, title, language, chip, code] of [
      ["codeforces", "4A", "Watermelon", "en", "English", "CF 4A"],
      ["codeforces", "1A", "Theatre Square", "ar-EG", "عربي", "CF 1A"],
      ["atcoder", "abc300_a", "N-choice question", "en", "English", "abc300_a"],
    ] as const) {
      const html = renderToStaticMarkup(
        <DemoChoiceRow
          example={{ problemId: externalId, judge, externalId, title, locale: language, code: "" }}
          locale={locale}
          busy={false}
          onStart={() => {}}
        />,
      );
      expect(html.match(/<button\b/g)).toHaveLength(1);
      expect(html).toContain(title);
      expect(html).toMatch(new RegExp(`<code dir="ltr" class="[^"]*text-muted">${code}</code>`));
      expect(html).toMatch(
        new RegExp(
          `<bdi dir="(?:ltr|rtl)" class="[^"]*border-line[^"]*font-sans[^"]*">${chip}</bdi>`,
        ),
      );
      expect(html).toContain(locale === "en" ? "Start" : "ابدأ");
      expect(html).not.toContain('class="badge"');
      expect(html).not.toContain("لغة English");
      expect(html).not.toContain("لغة العربية");
    }
  },
);
