import type { NewProblem } from "../db/repo/problems";

export type ParsedProblem = Omit<
  NewProblem,
  "judge" | "externalId" | "url" | "rating" | "tags" | "contestId"
>;

// Balance matching tags so nested divs/spans do not truncate judge sections.
export function element(html: string, tag: string, className?: string): string | null {
  const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  let start = -1;
  let depth = 0;
  for (const match of html.matchAll(tags)) {
    if (start < 0) {
      const classes = /\bclass=["']([^"']*)["']/i.exec(match[0])?.[1].split(/\s+/);
      if (match[1] || (className && !classes?.includes(className))) continue;
      start = match.index;
    }
    depth += match[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, match.index + match[0].length);
  }
  return null;
}

export function required(value: string | null | undefined): string {
  if (!value?.trim()) throw new Error("Invalid problem page");
  return value;
}

export function inner(html: string): string {
  return html.replace(/^<[^>]+>/, "").replace(/<\/[^>]+>$/, "");
}

function decode(text: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    thinsp: " ",
    ensp: " ",
    emsp: " ",
    le: "≤",
    ge: "≥",
    times: "×",
    minus: "−",
  };
  return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (whole: string, key: string) => {
    if (!key.startsWith("#")) return entities[key] ?? whole;
    const code = key[1].toLowerCase() === "x" ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

export function sampleText(html: string): string {
  return decode(html.replace(/<br\s*\/?\s*>|<\/div\s*>/gi, "\n").replace(/<[^>]*>/g, ""))
    .replace(/\r\n?/g, "\n")
    .replace(/^\n/, "")
    .replace(/\n*$/, "\n");
}

export function text(html: string): string {
  return decode(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<div\b[^>]*class=["']section-title["'][^>]*>[\s\S]*?<\/div>/gi, "")
      .replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, "^{$1}")
      .replace(/<sub\b[^>]*>([\s\S]*?)<\/sub>/gi, "_{$1}")
      .replace(/<br\s*\/?\s*>|<\/(?:p|div|section|h3|li|pre|blockquote)>/gi, "\n\n")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\$\$\$/g, "$")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function limits(html: string): { timeLimitMs: number; memoryLimitMb: number } {
  const content = text(html);
  const time = Number(required(/([\d.]+)\s*(?:seconds?|sec)\b/i.exec(content)?.[1]));
  const memory = Number(required(/([\d.]+)\s*(?:megabytes?|MiB|MB)\b/i.exec(content)?.[1]));
  if (!(time > 0 && memory > 0)) throw new Error("Invalid problem limits");
  return { timeLimitMs: time * 1000, memoryLimitMb: memory };
}
