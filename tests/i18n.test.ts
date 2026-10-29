import { expect, it } from "vitest";
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
