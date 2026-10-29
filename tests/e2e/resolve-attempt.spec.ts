import { expect, test } from "@playwright/test";

test("resolves seeded 4A without network and submits an attempt", async ({ page }) => {
  await page.goto("/problem");
  await page.getByLabel("Problem link").fill("https://codeforces.com/problemset/problem/4/A");
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Watermelon" })).toBeVisible();
  await expect(page.locator("pre").filter({ hasText: "8" })).toBeVisible();
  await expect(page.locator("pre").filter({ hasText: "YES" })).toBeVisible();
  await page.getByRole("textbox", { name: "Code", exact: true }).fill("int main() { return 0; }");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page).toHaveURL(/\/attempt\/[0-9A-HJKMNP-TV-Z]{26}$/);
  await expect(page.getByRole("heading", { name: "Watermelon" })).toBeVisible();
});
