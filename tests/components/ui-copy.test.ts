import { existsSync, readFileSync, readdirSync } from "node:fs";
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
  expect(css).toMatch(/body\s*\{[^}]*font-family:\s*var\(--font-sans\)/);
  expect(css).not.toMatch(/\[dir=["']rtl["']\]\s+body\s*\{[^}]*font-family:/);
  expect(css).toMatch(
    /:is\(code,\s*pre,\s*\.cm-editor\)[^{]*\{[^}]*direction:\s*ltr;[^}]*unicode-bidi:\s*isolate;/,
  );
  expect(css).toMatch(
    /:is\(code,\s*pre,\s*\.cm-editor\)[^{]*\{[^}]*font-family:\s*var\(--font-mono\)/,
  );
});

it("self-hosts the five variable font subsets with ranges and licenses, replacing Plex", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const layout = readFileSync("app/layout.tsx", "utf8");
  expect([...css.matchAll(/@font-face/g)]).toHaveLength(5);
  for (const [family, subsets, weight] of [
    ["readex-pro", ["arabic", "latin", "latin-ext"], "300 700"],
    ["jetbrains-mono", ["latin", "latin-ext"], "400 700"],
  ] as const) {
    expect(existsSync(`app/fonts/${family}/OFL.txt`)).toBe(true);
    for (const subset of subsets) {
      const file = `fonts/${family}/${family}-${subset}-var.woff2`;
      expect(existsSync(`app/${file}`)).toBe(true);
      const face =
        [...css.matchAll(/@font-face\s*\{[^}]+\}/g)].find(([rule]) => rule.includes(file))?.[0] ??
        "";
      expect(face).toContain(`font-weight: ${weight}`);
      expect(face).toContain("font-display: swap");
      expect(face).toContain("unicode-range:");
    }
  }
  expect(css).toContain('"Readex Pro"');
  expect(css).toContain('"JetBrains Mono"');
  expect(readdirSync("app/fonts").filter((file) => /plex|^OFL/.test(file))).toEqual([]);
  expect(css + layout).not.toMatch(/plex/i);
});
it("keeps existing page surfaces and captions readable with dark tokens", () => {
  expect(
    uiFiles.flatMap((path) =>
      (
        readFileSync(path, "utf8").match(
          /\b(?:bg-(?:white|(?:gray|slate|amber|red|green|sky)-\d+)|text-(?:gray|slate)-\d+)\b/g,
        ) ?? []
      ).map((utility) => `${path}: ${utility}`),
    ),
  ).toEqual([]);
});
