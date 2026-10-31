import { expect, test } from "@playwright/test";
import { t } from "../../src/i18n";

for (const locale of ["en", "ar-EG"] as const) {
  test(`shows the contest message on intake and diagnosis in ${locale}`, async ({
    page,
    context,
    request,
  }) => {
    await context.addCookies([
      { name: "daleel_locale", value: locale, url: "http://127.0.0.1:3108" },
    ]);
    await page.route("**/api/attempts", (route) =>
      route.fulfill({
        status: 423,
        json: { error: { code: "contest_running", message: "Server fallback" } },
      }),
    );
    await page.goto("/problem");
    await page.getByLabel(t("url", locale)).fill("https://codeforces.com/problemset/problem/4/A");
    await page.getByRole("button", { name: t("resolve", locale), exact: true }).click();
    await page.getByRole("textbox", { name: t("code", locale), exact: true }).fill("int main() {}");
    await page.getByRole("button", { name: t("submit", locale), exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText(t("contest_running", locale));

    const resolved = await request.post("/api/problems/resolve", {
      data: {
        url: "https://codeforces.com/problemset/problem/4/A",
      },
    });
    const { problem }: { problem: { id: string } } = await resolved.json();
    const created = await request.post("/api/attempts", {
      data: {
        problemId: problem.id,
        language: "cpp17",
        code: "int main() {}",
      },
    });
    expect(created.ok()).toBe(true);
    const { attemptId }: { attemptId: string } = await created.json();
    await page.route("**/api/attempts/*/diagnose", (route) =>
      route.fulfill({
        status: 423,
        json: { error: { code: "contest_running", message: "Server fallback" } },
      }),
    );
    await page.goto(`/attempt/${attemptId}`);
    await page.getByRole("button", { name: t("diagnose", locale), exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText(t("contest_running", locale));
  });
}
