import type { RunResult } from "@/src/runner/runner";

export const runVerdicts = ["wa", "tle", "mle", "re", "ole"] as const;
export type RunVerdict = (typeof runVerdicts)[number];

export function runVerdict(status: RunResult["status"]): RunVerdict {
  return status === "ok" ? "wa" : status;
}

/** Closed JSON string value for public_summary, or null while the model is still writing it. */
export function previewSummary(partial: string): string | null {
  const match = partial.match(/"public_summary"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (!match) return null;
  try {
    const value: unknown = JSON.parse(`"${match[1]}"`);
    return typeof value === "string" && value.length > 0 && value.length <= 240 ? value : null;
  } catch {
    return null;
  }
}

export function streamedBugFound(partial: string): boolean | null {
  const match = partial.match(/"bug_found"\s*:\s*(true|false)\b/);
  if (!match) return null;
  return match[1] === "true";
}
