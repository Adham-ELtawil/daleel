import { expect, test } from "@playwright/test";

test("landing page renders the product name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("banner").getByRole("link", { name: "Daleel" })).toBeVisible();
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

for (const locale of ["en", "ar-EG"] as const) {
  test(`landing preview fits 390px and keeps judge text isolated in ${locale}`, async ({
    page,
    context,
    baseURL,
  }) => {
    const rtl = locale === "ar-EG";
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await context.addCookies([{ name: "daleel_locale", value: locale, url: baseURL! }]);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const phrase = page.getByRole("heading", { level: 1 }).locator('bdi[dir="ltr"]');
    await expect(phrase).toHaveText("Wrong answer");
    await expect(phrase).toHaveCSS("white-space", "nowrap");
    expect(
      await phrase.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return range.getClientRects().length;
      }),
    ).toBe(1);

    const hero = page.locator('[data-motion="verdict"]');
    const file = hero.getByText("student.cpp", { exact: true });
    const problem = hero.getByText("Codeforces 1A Theatre Square", { exact: true });
    const replay = hero.getByRole("button", { name: rtl ? "اعرضها تاني" : "Replay" });
    await expect(problem).toHaveCSS("text-overflow", "ellipsis");
    await expect(problem).toHaveCSS("white-space", "nowrap");
    const titleBoxes = await Promise.all([file, problem, replay].map((item) => item.boundingBox()));
    const centers = titleBoxes.map((box) => box!.y + box!.height / 2);
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(1);
    const titleBar = hero.locator("> div").first();
    expect(await titleBar.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );

    const verdict = hero.locator(".hero-verdict");
    await expect(verdict).toHaveText("✗ Wrong answer");
    await expect(verdict).toHaveAttribute("dir", "ltr");
    await expect(verdict).toHaveCSS("font-family", /JetBrains Mono/);
    for (let index = 0; index < 3; index++) {
      const label = hero.locator("dt").nth(index);
      const value = hero.locator("dd").nth(index);
      await expect(label).toHaveCSS("font-family", /Readex Pro/);
      await expect(value.locator("code")).toHaveAttribute("dir", "ltr");
      await expect(value.locator("code")).toHaveCSS("unicode-bidi", "isolate");
      const labelBox = (await label.boundingBox())!;
      const valueBox = (await value.boundingBox())!;
      expect(
        rtl ? labelBox.x - valueBox.x - valueBox.width : valueBox.x - labelBox.x - labelBox.width,
      ).toBeGreaterThanOrEqual(11);
    }
    await expect(hero.locator(".hero-hint")).toHaveCSS("opacity", "1");
    await expect(hero.locator(".hero-hint")).toHaveCSS("background-color", "rgb(22, 33, 63)");
    await expect(hero.locator(".hero-hint")).toHaveCSS("border-inline-start-width", "3px");
    await expect(hero.locator(".hero-hint")).toHaveCSS(
      "border-inline-start-color",
      "rgb(243, 185, 95)",
    );
    await expect(hero.locator('[data-line="8"]')).toHaveCSS("border-inline-start-width", "3px");
    await expect(hero.locator('[data-line="8"]')).toHaveCSS(
      "border-inline-start-color",
      "rgb(255, 123, 138)",
    );
    await expect(hero.locator('[data-line="8"]')).toHaveCSS("background-color", /\/ 0\.12\)/);

    const start = rtl ? "ابدأ" : "Start";
    const rows = page.locator(".demo-row");
    await expect(rows).toHaveCount(3);
    for (const [index, name] of [
      `Watermelon CF 4A English ${start}`,
      `Theatre Square CF 1A عربي ${start}`,
      `N-choice question abc300_a English ${start}`,
    ].entries()) {
      await expect(rows.nth(index)).toHaveAccessibleName(name);
    }
    const chip = rows.first().locator("bdi").last();
    await expect(chip).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(chip).toHaveCSS("font-family", /Readex Pro/);
    const action = rows.first().getByText(start, { exact: true });
    await rows.first().hover();
    await expect(action).toHaveCSS("opacity", "1");
    await page.mouse.move(0, 0);
    await rows.first().focus();
    await expect(action).toHaveCSS("opacity", "1");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
}
