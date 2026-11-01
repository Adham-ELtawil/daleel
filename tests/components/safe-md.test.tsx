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
it("renders bold and italic text alongside isolated inline code", async () => {
  expect(await render("Both parts must be **positive** and *even*: `w > 2`.")).toBe(
    '<p dir="auto">Both parts must be <strong>positive</strong> and <em>even</em>: <code dir="ltr" class="bidi-isolate">w &gt; 2</code>.</p>',
  );
  expect(await render("راجع **الشرط** وخلي *القيمة* موجبة.")).toBe(
    '<p dir="auto">راجع <strong>الشرط</strong> وخلي <em>القيمة</em> موجبة.</p>',
  );
});
it.each([
  "**bold *nested* text**",
  "*italic **nested** text*",
  "***nested***",
  "**unfinished",
  "*unfinished",
  "**mismatched*",
  "2 * 3 * 4",
  "**two\nlines**",
])("preserves unsupported or unmatched emphasis as text: %s", async (text) => {
  expect(await render(text)).toBe(`<p dir="auto">${text}</p>`);
});
it("escapes HTML inside emphasis and leaves code asterisks literal", async () => {
  const html = await render(
    '**<img src=x onerror="run()">** *<script>run()</script>* `**literal**`',
  );
  expect(html).toContain("<strong>&lt;img src=x onerror=&quot;run()&quot;&gt;</strong>");
  expect(html).toContain("<em>&lt;script&gt;run()&lt;/script&gt;</em>");
  expect(html).toContain('<code dir="ltr" class="bidi-isolate">**literal**</code>');
  expect(html).not.toMatch(/<(script|img|a)\b/);
});
