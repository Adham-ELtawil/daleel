import { expect, test } from "@playwright/test";

test("landing page renders the product name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Daleel");
});

for (const locale of ["en", "ar-EG"] as const) {
  test(`header aligns the toggle at the logical end in ${locale}`, async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([{ name: "daleel_locale", value: locale, url: baseURL! }]);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "en" ? "ltr" : "rtl");
    const header = page.getByRole("banner");
    const brand = header.locator('a[href="/"]');
    const toggle = header.getByRole("button");
    await expect(brand.locator("svg")).toBeVisible();
    await expect(header.getByRole("navigation").getByRole("link")).toHaveCount(3);
    const brandBox = await brand.boundingBox();
    const navBox = await header.getByRole("navigation").boundingBox();
    const toggleBox = await toggle.boundingBox();
    expect(brandBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    expect(toggleBox).not.toBeNull();
    if (locale === "en") {
      expect(brandBox!.x + brandBox!.width).toBeLessThan(navBox!.x);
      expect(navBox!.x + navBox!.width).toBeLessThan(toggleBox!.x);
    } else {
      expect(toggleBox!.x + toggleBox!.width).toBeLessThan(navBox!.x);
      expect(navBox!.x + navBox!.width).toBeLessThan(brandBox!.x);
    }
  });
}
