import type { HintLadder } from "@/src/llm/schemas/ladder";

export type Hint = Omit<HintLadder["levels"][number], "kind">;
export function appendHint(hints: Hint[], hint: Hint): Hint[] {
  return [...hints.filter((item) => item.level !== hint.level), hint].sort(
    (a, b) => a.level - b.level,
  );
}
export function nextHintLevel(hints: Hint[]): number | null {
  const next = Math.max(0, ...hints.map((hint) => hint.level)) + 1;
  return next <= 4 ? next : null;
}
export function shouldAutostart(value: unknown, status: string, diagnosed: boolean) {
  return value === "1" && status === "new" && !diagnosed;
}
export function formatAttemptDate(timestamp: number, locale: "en" | "ar-EG") {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}
