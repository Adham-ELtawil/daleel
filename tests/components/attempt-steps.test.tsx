import React from "react";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

it.each([0, 1, 2, 3, 4])("marks %s completed steps from props in both locales", async (count) => {
  const path = resolve("src/components/attempt-steps.tsx");
  expect(existsSync(path), "Attempt progress presentation is missing").toBe(true);
  const { AttemptStepper } = (await import(
    path
  )) as typeof import("@/src/components/attempt-steps");
  for (const locale of ["en", "ar-EG"] as const) {
    const html = renderToStaticMarkup(
      <AttemptStepper complete={[count > 0, count > 1, count > 2, count > 3]} locale={locale} />,
    );
    expect(html.match(/data-state="complete"/g) ?? []).toHaveLength(count);
    expect(html.match(/aria-current="step"/g) ?? []).toHaveLength(count < 4 ? 1 : 0);
    const steps = [...html.matchAll(/<li\b[\s\S]*?<\/li>/g)].map((match) => match[0]);
    expect(steps).toHaveLength(4);
    for (const [index, label] of (locale === "en"
      ? ["Diagnosis", "Counterexample", "Hints", "Explanation"]
      : ["التشخيص", "مثال يوقع الكود", "التلميحات", "الشرح"]
    ).entries()) {
      expect(steps[index]).toContain(label);
      expect(steps[index]).toContain(
        `data-state="${index < count ? "complete" : index === count ? "current" : "pending"}"`,
      );
    }
    expect(html).not.toMatch(/<button|<a\b/);
  }
});
