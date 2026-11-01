import en from "@/messages/en.json";
import ar from "@/messages/ar.json";
import type { HintLadder } from "@/src/llm/schemas/ladder";

const kinds = ["nudge", "concept", "precise", "full"] as const;
type Violation = { level: number; rule: string };
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

export function validateLadder(
  ladder: HintLadder,
  context: { fixInternal: string; failingInput: string | null; mode?: "code" | "idea" },
): { ok: boolean; violations: Violation[] } {
  const violations: Violation[] = [];
  const fixes = context.fixInternal
    .split(/\r?\n/)
    .map(normalize)
    .filter((line) => line.length > 15);
  const failing = context.failingInput && normalize(context.failingInput);
  for (let i = 0; i < Math.max(4, ladder.levels.length); i++) {
    const hint = ladder.levels[i];
    const level = i + 1;
    const add = (rule: string) => violations.push({ level, rule });
    if (!hint || hint.level !== level || level > 4) add("order");
    if (!hint) continue;
    if (hint.kind !== kinds[i]) add("kind");
    const text = [hint.title, hint.body_md, hint.question_back ?? ""].join("\n");
    if ((level <= 3 || context.mode === "idea") && text.includes("```")) add("code_fence");
    if (context.mode === "idea" && level === 1 && !hint.question_back?.trim()) add("question_back");
    if (level <= 2 && [...text.matchAll(/`([^`]+)`/g)].some((match) => match[1].length > 12))
      add("long_inline_code");
    if (level <= 2 && failing && normalize(text).includes(failing)) add("failing_input");
    if (level <= 3 && fixes.some((fix) => normalize(text).includes(fix))) add("fix_leak");
  }
  return { ok: violations.length === 0, violations };
}

export function applyFallback(
  ladder: HintLadder,
  violations: Violation[],
  locale: "en" | "ar-EG",
  mode: "code" | "idea" = "code",
): HintLadder {
  const messages = locale === "en" ? en : ar;
  return {
    levels: kinds.map((kind, i) => {
      if (ladder.levels[i] && !violations.some((v) => v.level === i + 1)) return ladder.levels[i];
      const copy =
        mode === "idea"
          ? messages.idea_fallback
          : messages[`ladder_fallback_${(i + 1) as 1 | 2 | 3 | 4}`];
      return {
        level: i + 1,
        kind,
        title: copy.title,
        body_md: copy.body,
        question_back: mode === "idea" && i === 0 ? messages.idea_fallback.question : null,
      };
    }),
  };
}
