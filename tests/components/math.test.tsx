import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

async function render(text: string) {
  const { MathText } = await import("@/src/components/math");
  return renderToStaticMarkup(createElement(MathText, { text }));
}

it("renders texttt as KaTeX HTML and accessible MathML without dollar delimiters", async () => {
  const html = await render("$\\texttt{six}$");
  expect(html).toContain('class="katex"');
  expect(html).toContain('class="katex-mathml"');
  expect(html).not.toContain("$");
});

it("renders inequalities and isolates math inside Arabic text", async () => {
  expect(await render("$1 \\le n, m \\le 100$")).toContain("≤");
  const html = await render("لو $n \\le 10^5$ يبقى");
  expect(html).toMatch(/^لو <span dir="ltr" class="math bidi-isolate">/);
  expect(html).toMatch(/<\/span> يبقى$/);
});

it.each(["$$\\frac{a}{b}$$", "$$$$$$x^2$$$$$$"])(
  "uses a block span for display math inside a paragraph: %s",
  async (text) => {
    const html = await render(text);
    expect(html).toMatch(/^<span dir="ltr" class="math math-display block bidi-isolate">/);
    expect(html).toContain('class="katex-display"');
    expect(html).not.toContain("<div");
  },
);

it.each(["\\badcommand{x}", "\\frac{", "\\badcommand{<img src=x>}"])(
  "falls back to escaped original TeX on parse failure: %s",
  async (tex) => {
    const { MathSpan } = await import("@/src/components/math");
    const html = renderToStaticMarkup(createElement(MathSpan, { tex, display: false }));
    const escaped = renderToStaticMarkup(createElement("span", null, tex)).slice(6, -7);
    expect(html).toBe('<code dir="ltr" class="bidi-isolate">' + escaped + "</code>");
  },
);

it.each(["$\\href{javascript:alert(1)}{x}$", "$<img src=x>$"])(
  "keeps untrusted TeX from producing active HTML: %s",
  async (text) => {
    const html = await render(text);
    expect(html).not.toMatch(/href=["']javascript:|<(?:img|script)\b/);
  },
);

it("keeps plain newlines and literal currency intact", async () => {
  expect(await render("costs \\$5\nand $10")).toBe("costs $5\nand $10");
});
