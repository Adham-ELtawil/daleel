import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Run with DEMO_REPLAY=1; the model responses come from committed recordings.
for (const [title, locale, directory] of [
  ["Watermelon", "en", "cf-4A-watermelon"],
  ["Theatre Square", "ar-EG", "cf-1A-theatre-square"],
  ["N-choice question", "en", "atcoder-abc300_a"],
] as const) {
  test(`starts ${title} without typing and restores replay badges`, async ({ page, context }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Try the demo", exact: true })).toBeVisible();
    const create = page.waitForRequest(
      (r) => r.url().endsWith("/api/attempts") && r.method() === "POST",
    );
    await page
      .getByRole("button", { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })
      .click();
    const sent = await create;
    expect(sent.postDataJSON()).toEqual({
      problemId: expect.any(String),
      language: "cpp17",
      code: readFileSync(`docs/examples/${directory}/student.cpp`, "utf8"),
    });
    expect(await context.cookies()).toContainEqual(
      expect.objectContaining({ name: "daleel_locale", value: locale }),
    );
    await expect(page).toHaveURL(/\/attempt\/[^/?]+\?autostart=1$/);
    // Recordings carry their own date (re-recorded 2026-10-31); match any recording date.
    const badge =
      locale === "en"
        ? /^Replay \(recorded \d{4}-\d{2}-\d{2}\)$/
        : /^إعادة تشغيل من تسجيل بتاريخ \d{4}-\d{2}-\d{2}$/;
    await expect(page.getByText(badge)).toHaveCount(1);
    await expect(page.locator(".meta-badge").first()).toContainText(
      "Muse Spark · muse-spark-1.3 · replay",
    );
    await page
      .getByRole("button", { name: locale === "en" ? "Hint 1" : "تلميح 1", exact: true })
      .click();
    await expect(page.getByText(badge)).toHaveCount(2);
    await page.reload();
    await expect(page.getByText(badge)).toHaveCount(2);
    await expect(page.locator("[data-hint-level]")).toHaveCount(1);
    // Diagnosis and hint ladder each carry their Meta provenance chip after reload.
    await expect(page.locator(".meta-badge")).not.toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
  });
}
