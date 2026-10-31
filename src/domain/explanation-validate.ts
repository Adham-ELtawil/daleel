import { codeLines } from "./code-lines";
import { fixArabicPublicText } from "./arabic-style";
import type { Explanation } from "@/src/llm/schemas/explanation";

export function validateExplanation(
  explanation: Explanation,
  code: string,
  stress: {
    status: string;
    expectedOutput: string | null;
    actualOutput: string | null;
  } | null,
  locale: "en" | "ar-EG" = "en",
): Explanation {
  const lines = codeLines(code);
  const verified = stress?.status === "verified" ? stress : null;
  const prose = (text: string, max: number) =>
    locale === "ar-EG" ? fixArabicPublicText(text).slice(0, max) : text;
  return {
    ...explanation,
    explanation_md: prose(explanation.explanation_md, 3000),
    complexity_note:
      explanation.complexity_note === null ? null : prose(explanation.complexity_note, 300),
    fix: explanation.fix.filter((edit) => lines[edit.line - 1]?.trim() === edit.old.trim()),
    trace: {
      ...explanation.trace,
      student_output: verified?.actualOutput ?? explanation.trace.student_output,
      expected_output: verified?.expectedOutput ?? explanation.trace.expected_output,
      frames: explanation.trace.frames
        .slice(0, 40)
        .map((frame) => ({ ...frame, caption: prose(frame.caption, 240) })),
    },
  };
}
