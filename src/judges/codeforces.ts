import { element, inner, limits, required, sampleText, text, type ParsedProblem } from "./html";

export function parseCodeforcesHtml(html: string): ParsedProblem {
  const root = inner(required(element(html, "div", "problem-statement")));
  const header = required(element(root, "div", "header"));
  const pres = (kind: string) =>
    Array.from(
      root.matchAll(
        new RegExp(
          `<div\\b[^>]*class=["']${kind}["'][^>]*>[\\s\\S]*?<pre\\b[^>]*>([\\s\\S]*?)</pre>`,
          "gi",
        ),
      ),
      (match) => sampleText(match[1]),
    );
  const inputs = pres("input");
  const outputs = pres("output");
  if (!inputs.length || inputs.length !== outputs.length)
    throw new Error("Invalid problem samples");
  const notes = element(root, "div", "note");
  return {
    title: required(text(required(element(header, "div", "title"))))
      .replace(/^Problem -\s*/, "")
      .replace(/^[A-Z]\d*\.\s*/, ""),
    statementMd: required(
      text(required(element(root.slice(root.indexOf(header) + header.length), "div"))),
    ),
    inputSpecMd: required(text(required(element(root, "div", "input-specification")))),
    outputSpecMd: required(text(required(element(root, "div", "output-specification")))),
    notesMd: notes ? text(notes) || null : null,
    samples: inputs.map((input, index) => ({ input, output: outputs[index] })),
    ...limits(header),
  };
}
