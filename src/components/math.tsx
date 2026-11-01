import React from "react";
import katex from "katex";
import { splitMath } from "@/src/lib/math";

export function MathSpan({ tex, display }: { tex: string; display: boolean }) {
  let html: string;
  try {
    html = katex.renderToString(tex, {
      displayMode: display,
      throwOnError: true,
      trust: false,
      strict: "ignore",
      output: "htmlAndMathml",
      maxSize: 50,
      maxExpand: 1000,
    });
  } catch {
    return (
      <code dir="ltr" className="bidi-isolate">
        {tex}
      </code>
    );
  }
  return (
    <span
      dir="ltr"
      className={display ? "math math-display block bidi-isolate" : "math bidi-isolate"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function MathText({ text }: { text: string }) {
  return splitMath(text).map((part, index) =>
    part.kind === "text" ? (
      part.value
    ) : (
      <MathSpan key={index} tex={part.value} display={part.display} />
    ),
  );
}
