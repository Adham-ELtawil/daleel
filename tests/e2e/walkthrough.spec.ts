import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import a from "../fixtures/llm/explanation-a.json";
import b from "../fixtures/llm/explanation-b.json";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";

for (const [fixture, problem, example] of [
  [a, "4/A", "cf-4A-watermelon"],
  [b, "1/A", "cf-1A-theatre-square"],
] as const) {
  for (const locale of ["en", "ar-EG"] as const) {
    test(`steps through ${problem} in ${locale} with offline explain and playback`, async ({
      page,
      context,
    }) => {
      await context.addCookies([
        { name: "daleel_locale", value: locale, url: "http://127.0.0.1:3108" },
      ]);
      await context.route(/^https:\/\//, (route) => route.abort());
      const resolved = await page.request.post("/api/problems/resolve", {
        data: { url: `https://codeforces.com/problemset/problem/${problem}` },
      });
      expect(resolved.ok()).toBe(true);
      const { problem: stored } = await resolved.json();
      const created = await page.request.post("/api/attempts", {
        data: {
          problemId: stored.id,
          language: "cpp17",
          code: readFileSync(`docs/examples/${example}/student.cpp`, "utf8"),
        },
      });
      const { attemptId } = await created.json();
      const copy = (locale === "en" ? en : ar).walkthrough;
      const intake = (locale === "en" ? en : ar).intake;
      let requests = 0;
      await page.route(`**/api/attempts/${attemptId}/explain`, async (route) => {
        expect(route.request().method()).toBe("POST");
        expect(route.request().postDataJSON()).toEqual({ locale });
        requests++;
        if (requests === 1)
          return route.fulfill({ status: 503, json: { error: { code: "budget_reached" } } });
        const { trace, ...explanation } = fixture;
        await route.fulfill({ json: { explanation, trace } });
      });
      await page.goto(`/attempt/${attemptId}`);
      await expect(page.getByRole("button", { name: copy.full_explanation })).toHaveCount(0);
      await page.getByRole("button", { name: intake.stuck, exact: true }).click();
      await page.getByRole("button", { name: copy.full_explanation }).click();
      await expect(page.getByRole("alert")).toHaveText(copy.load_error);
      await page.getByRole("button", { name: copy.full_explanation }).click();
      const player = page.locator("#walkthrough");
      await expect(player).toBeVisible();
      await expect(
        player.getByText(fixture.trace.frames[0].caption, { exact: true }),
      ).toBeVisible();
      await expect(player.locator('[data-code-line="5"]')).toHaveAttribute("data-active", "true");
      await player.getByRole("button", { name: copy.next }).click();
      await expect(
        player.getByText(fixture.trace.frames[1].caption, { exact: true }),
      ).toBeVisible();
      await player.focus();
      await page.keyboard.press("ArrowLeft");
      await expect(
        player.getByText(fixture.trace.frames[0].caption, { exact: true }),
      ).toBeVisible();
      await page.keyboard.press("ArrowRight");
      await expect(
        player.getByText(fixture.trace.frames[1].caption, { exact: true }),
      ).toBeVisible();
      const scrub = player.getByRole("slider", { name: copy.frame });
      await scrub.focus();
      await page.keyboard.press("Home");
      await page.clock.install();
      await player.getByRole("combobox", { name: copy.speed }).selectOption("0.5");
      await player.focus();
      await page.keyboard.press("Space");
      await expect(player.getByRole("button", { name: copy.pause })).toBeVisible();
      await page.clock.runFor(2100);
      await expect(scrub).toHaveValue("1");
      await player.getByRole("combobox", { name: copy.speed }).selectOption("2");
      await page.clock.runFor(600);
      await expect(scrub).toHaveValue("2");
      await player.getByRole("button", { name: copy.pause }).click();
      await page.clock.runFor(2000);
      await expect(scrub).toHaveValue("2");
      await scrub.focus();
      await page.keyboard.press("End");
      await expect(
        player.getByText(fixture.trace.frames.at(-1)!.caption, { exact: true }),
      ).toBeVisible();
      const output = player.locator("pre");
      await expect(output.nth(1)).toHaveText(fixture.trace.input);
      await expect(output.nth(2)).toHaveText(fixture.trace.expected_output);
      await expect(output.nth(3)).toHaveText(fixture.trace.student_output);
      await player.getByRole("button", { name: copy.play }).click();
      await expect(scrub).toHaveValue("0");
      await page.clock.runFor(500 * fixture.trace.frames.length);
      await expect(scrub).toHaveValue(String(fixture.trace.frames.length - 1));
      await expect(player.getByRole("button", { name: copy.play })).toBeVisible();
      expect(requests).toBe(2);
    });
  }
}
