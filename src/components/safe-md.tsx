import React from "react";
import { splitMath } from "@/src/lib/math";
import { MathSpan } from "./math";

// Deliberately support only flat emphasis. Nested/malformed delimiters stay text.
function emphasis(text: string) {
  const runs = [...text.matchAll(/\*+/g)];
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (let index = 0; index < runs.length; index++) {
    const open = runs[index];
    let closing = index + 1;
    while (closing < runs.length && runs[closing][0] !== open[0]) closing++;
    if (closing === runs.length) break;
    const close = runs[closing];
    const content = text.slice(open.index + open[0].length, close.index);
    const end = close.index + close[0].length;
    nodes.push(text.slice(cursor, open.index));
    if (
      closing === index + 1 &&
      open[0].length <= 2 &&
      content.trim() === content &&
      content &&
      !content.includes("\n")
    ) {
      nodes.push(
        open[0].length === 2 ? (
          <strong key={index}>{content}</strong>
        ) : (
          <em key={index}>{content}</em>
        ),
      );
    } else {
      nodes.push(text.slice(open.index, end));
    }
    cursor = end;
    index = closing;
  }
  nodes.push(text.slice(cursor));
  return nodes;
}

export function SafeMd({ text }: { text: string }) {
  return text
    .split(/\n\s*\n/)
    .filter((part) => part.trim())
    .map((paragraph, index) => (
      <p key={index} dir="auto">
        {paragraph.split(/(`[^`\n]+`)/g).map((part, token) =>
          part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
            <code key={token} dir="ltr" className="bidi-isolate">
              {part.slice(1, -1)}
            </code>
          ) : (
            splitMath(part).map((segment, index) =>
              segment.kind === "math" ? (
                <MathSpan key={index} tex={segment.value} display={segment.display} />
              ) : (
                emphasis(segment.value)
              ),
            )
          ),
        )}
      </p>
    ));
}
