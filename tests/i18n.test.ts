import { expect, it } from "vitest";
import * as i18n from "@/src/i18n";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";
import { DiagnosisSchema } from "@/src/llm/schemas/diagnosis";

it.each(["en", "ar-EG"] as const)("labels every bug class in %s", (locale) => {
  const messages = locale === "en" ? en : ar;
  expect(messages).toHaveProperty("bugClasses");
  const labels = Reflect.get(messages, "bugClasses");
  expect(Object.keys(labels).sort()).toEqual([...DiagnosisSchema.shape.bug_class.options].sort());
  for (const bug of DiagnosisSchema.shape.bug_class.options) {
    const label = i18n.bugClassLabel(bug, locale);
    expect(label).toBe(Reflect.get(labels, bug));
    expect(label).not.toBe(bug);
    expect(label.trim()).not.toBe("");
    if (locale === "ar-EG") {
      expect(label).toMatch(/^[\u0600-\u06ff]/);
      expect(label).not.toMatch(/[()\/→←]/);
    }
  }
  expect(i18n.bugClassLabel("unknown_legacy_class", locale)).toBe(Reflect.get(labels, "other"));
});

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
it("has complete stress copy in both locales with Arabic-first lines", () => {
  const stressKeys = [
    "pending",
    "verified",
    "input",
    "expected",
    "actual",
    "verified_note",
    "not_verified",
    "compile_error",
    "no_mismatch",
    "skipped",
    "brute_untrusted",
    "error",
    "missing",
    "contradiction",
  ];
  for (const messages of [en, ar]) {
    expect(messages).toHaveProperty("stress");
    const stress = messages.stress;
    expect(Object.keys(stress).sort()).toEqual([...stressKeys].sort());
    for (const text of Object.values(stress)) expect(text.trim()).not.toBe("");
  }
  const stress = ar.stress;
  for (const text of Object.values(stress)) {
    expect(text).toMatch(/^[\u0600-\u06ff]/);
    expect(text).not.toMatch(/[()\/→←]/);
  }
});
it.each([
  ["en", { lang: "en", dir: "ltr" }],
  ["ar-EG", { lang: "ar", dir: "rtl" }],
] as const)("sets whole-page attributes for %s", (locale, expected) => {
  expect(i18n.localeAttrs(locale)).toEqual(expected);
});
it("can translate landing copy through the typed translator", () => {
  expect(i18n.t("description", "ar-EG", "landing")).toBe(ar.landing.description);
});
it("has translated demo and replay badge copy in both locales", () => {
  for (const messages of [en, ar]) {
    expect(messages.intake).toHaveProperty("try_demo");
    expect(messages.intake).toHaveProperty("replay_badge");
  }
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
