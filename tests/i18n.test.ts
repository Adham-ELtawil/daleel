import { expect, it } from "vitest";
import * as i18n from "@/src/i18n";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

const keys = (value: object, prefix = ""): string[] =>
  Object.entries(value).flatMap(([key, entry]) =>
    typeof entry === "object" && entry !== null
      ? keys(entry, `${prefix}${key}.`)
      : `${prefix}${key}`,
  );
it("has every English key in Arabic, including the intake UI", () => {
  expect(en).toHaveProperty("intake");
  expect(keys(ar).sort()).toEqual(keys(en).sort());
});
it.each([
  ["en", "ar-EG,ar;q=0.9", "en"],
  ["ar-EG", "en", "ar-EG"],
  [undefined, "ar-EG,ar;q=0.9,en;q=0.8", "ar-EG"],
  ["invalid", "en-US,en;q=0.9,ar;q=0.8", "en"],
  [undefined, null, "en"],
])("selects locale from cookie=%s and browser=%s", (cookie, language, expected) => {
  expect(i18n).toHaveProperty("resolveLocale");
  if ("resolveLocale" in i18n && typeof i18n.resolveLocale === "function") {
    expect(i18n.resolveLocale(cookie, language)).toBe(expected);
  }
});
