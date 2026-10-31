import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : path.endsWith(".tsx") ? [path] : [];
  });
const uiFiles = [...files("app"), ...files("src/components")];
// Closing tags and lowercase HTML tags avoid mistaking TS generics for JSX.
const latinText = (source: string) =>
  [...source.matchAll(/>([^<>{}]*[A-Za-z]{3}[^<>{}]*)(?=<\/[A-Za-z]|<[a-z][\w-]*(?:\s|>|\/))/g)]
    .map((match) => match[1].trim())
    .filter((text) => !["Daleel", "C++", "YES/NO"].includes(text));
const physicalClasses = /\b(?:ml-|mr-|pl-|pr-|left-|right-|text-left\b|text-right\b)/g;

it("detects untranslated JSX text while allowing product/code labels", () => {
  expect(latinText('<button>Try again</button><p>{t("title")}</p>')).toEqual(["Try again"]);
  expect(latinText("<p>Try again <span>Loading</span></p>")).toEqual(["Try again", "Loading"]);
  expect(latinText("async function post<T>(path: string): Promise<T> {}")).toEqual([]);
  expect(latinText("<h1>Daleel</h1><code>YES/NO</code>")).toEqual([]);
});
it("keeps UI copy in message dictionaries", () => {
  expect(
    uiFiles.flatMap((path) =>
      latinText(readFileSync(path, "utf8")).map((text) => `${path}: ${text}`),
    ),
  ).toEqual([]);
});
it("uses logical Tailwind classes throughout pages and components", () => {
  expect("ms-2 text-start".match(physicalClasses)).toBeNull();
  expect("ml-2 text-right".match(physicalClasses)).toEqual(["ml-", "text-right"]);
  expect(
    uiFiles.flatMap((path) =>
      (readFileSync(path, "utf8").match(physicalClasses) ?? []).map((text) => `${path}: ${text}`),
    ),
  ).toEqual([]);
});
it("uses one body font in both locales and keeps code isolated and monospace", () => {
  const css = readFileSync("app/globals.css", "utf8");
  expect(css).toMatch(/body\s*\{[^}]*font-family:\s*var\(--font-daleel\)/);
  expect(css).not.toMatch(/\[dir=["']rtl["']\]\s+body\s*\{[^}]*font-family:/);
  expect(css).toMatch(
    /:is\(code,\s*pre,\s*\.cm-editor\)[^{]*\{[^}]*direction:\s*ltr;[^}]*unicode-bidi:\s*isolate;/,
  );
  expect(css).toMatch(
    /:is\(code,\s*pre,\s*\.cm-editor\)[^{]*\{[^}]*font-family:\s*var\(--font-mono\)/,
  );
});
