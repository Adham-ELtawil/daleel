import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

async function render(text: string) {
  const { SafeMd } = await import("@/src/components/safe-md");
  return renderToStaticMarkup(createElement(SafeMd, { text }));
}
it("renders paragraphs and isolates inline code in Arabic text", async () => {
  const html = await render("راجع `a[i] < 2` هنا.\n\nجرّب تاني.");
  expect(html).toBe(
    '<p dir="auto">راجع <code dir="ltr" class="bidi-isolate">a[i] &lt; 2</code> هنا.</p><p dir="auto">جرّب تاني.</p>',
  );
});
it("keeps scripts, HTML attributes and markdown links as escaped text", async () => {
  const html = await render(
    '<script>alert(1)</script> <img src=x onerror="run()"> [link](javascript:run())',
  );
  expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(html).toContain("&lt;img src=x onerror=&quot;run()&quot;&gt;");
  expect(html).toContain("[link](javascript:run())");
  expect(html).not.toMatch(/<(script|img|a)\b/);
});
it("preserves unmatched backticks and single newlines without interpreting HTML", async () => {
  expect(await render("text `unfinished\nnext line")).toBe(
    '<p dir="auto">text `unfinished\nnext line</p>',
  );
  expect(await render("  \n\n ")).toBe("");
});
