import { element, inner, limits, required, sampleText, text, type ParsedProblem } from "./html";

export function parseAtcoderHtml(html: string): ParsedProblem {
  const english = required(element(html, "span", "lang-en"));
  const sections = Array.from(
    english.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/gi),
    (match) => {
      const heading = required(element(match[1], "h3"));
      return { heading: text(heading), body: match[1].replace(heading, "") };
    },
  );
  const section = (heading: string) => sections.find((part) => part.heading === heading)?.body;
  const inputs = sections.filter((part) => /^Sample Input \d+$/.test(part.heading));
  const outputs = sections.filter((part) => /^Sample Output \d+$/.test(part.heading));
  if (!inputs.length || inputs.length !== outputs.length)
    throw new Error("Invalid problem samples");
  const notes: string[] = [];
  const samples = inputs.map((part) => {
    const number = part.heading.replace("Sample Input ", "");
    const output = required(section(`Sample Output ${number}`));
    const pre = required(element(output, "pre"));
    notes.push(text(output.replace(pre, "")));
    return {
      input: sampleText(inner(required(element(part.body, "pre")))),
      output: sampleText(inner(pre)),
    };
  });
  return {
    title: required(text(required(element(html, "title")))).replace(/^Problem -\s*/, ""),
    statementMd:
      required(text(required(section("Problem Statement")))) +
      (section("Constraints")
        ? `\n\nConstraints\n\n${text(required(section("Constraints")))}`
        : ""),
    inputSpecMd: required(text(required(section("Input")))),
    outputSpecMd: required(text(required(section("Output")))),
    notesMd: notes.filter(Boolean).join("\n\n") || null,
    samples,
    ...limits(html.slice(0, html.indexOf(english))),
  };
}
