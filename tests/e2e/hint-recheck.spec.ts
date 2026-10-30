import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// TODO(PR-22): Run this flow on replay so it needs no live model.
test.skip(process.env.E2E_LIVE !== "1", "Requires explicit E2E_LIVE=1");
test("reveals 1→4, restores hints, and re-checks a child automatically", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/problem");
  await page.getByLabel("Problem link").fill("https://codeforces.com/problemset/problem/4/A");
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  const code = readFileSync("docs/examples/cf-4A-watermelon/student.cpp", "utf8");
  await page.getByRole("textbox", { name: "Code", exact: true }).fill(code);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.getByRole("button", { name: "Diagnose", exact: true }).click();
  for (let level = 1; level <= 4; level++) {
    await page
      .getByRole("button", { name: `Hint ${level}`, exact: true })
      .click({ timeout: 120_000 });
    await expect(page.locator("[data-hint-level]")).toHaveCount(level);
  }
  await expect(page.getByRole("button", { name: /^Hint / })).toHaveCount(0);
  await page.reload();
  await expect(page.locator("[data-hint-level]")).toHaveCount(4);
  await page.getByRole("button", { name: "I'm stuck", exact: true }).click();
  await expect(page.getByText("Full explanation is unlocked.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "I solved it", exact: true }).click();
  await expect(
    page.getByText("Nice work! Your attempt is marked solved.", { exact: true }),
  ).toBeVisible();
  const parentUrl = page.url();
  await page.getByRole("button", { name: "I fixed it → re-check", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Updated code", exact: true });
  await expect(editor).toHaveText(code.trim(), { useInnerText: true });
  await editor.fill(code.replace("w % 2 == 0", "w > 2 && w % 2 == 0"));
  await page.getByRole("button", { name: "Re-check", exact: true }).click();
  await expect(page).toHaveURL(/\/attempt\/[^/?]+\?autostart=1$/);
  expect(page.url()).not.toBe(parentUrl);
  await expect(page.getByRole("button", { name: "Hint 1", exact: true })).toBeVisible({
    timeout: 120_000,
  });
  await page.getByRole("link", { name: "My attempts", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My attempts", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Watermelon", exact: true }).first()).toBeVisible();
});
