import { z } from "zod";
import { t } from "@/src/i18n";
import type { weeklyStats } from "./weekly-stats";

type Stats = ReturnType<typeof weeklyStats>;
type History = { judge: string; externalId: string; status: string; rating: number | null };
const CandidateSchema = z.object({
  contestId: z.number().int().positive(),
  index: z.string().regex(/^[A-Z][A-Z0-9]*$/),
  name: z.string().min(1),
  type: z.literal("PROGRAMMING"),
  rating: z.number().int().nonnegative(),
  tags: z.array(z.string()),
});
type Candidate = z.infer<typeof CandidateSchema> & { id: string };
function ordered(candidates: Candidate[]) {
  return [...new Map(candidates.map((p) => [p.id, p])).values()].sort(
    (a, b) =>
      a.rating - b.rating || a.contestId - b.contestId || a.index.localeCompare(b.index, "en"),
  );
}
export function reportCandidates(
  problemset: unknown[],
  topTags: Stats["topTags"],
  history: History[],
) {
  const cf = history.filter((row) => row.judge === "codeforces");
  const attempted = new Set(cf.map((row) => row.externalId));
  const solved = cf
    .flatMap((row) => (row.status === "solved" && row.rating !== null ? [row.rating] : []))
    .sort((a, b) => a - b);
  const middle = Math.floor(solved.length / 2);
  const median = solved.length
    ? (solved[middle] + solved[Math.floor((solved.length - 1) / 2)]) / 2
    : null;
  const [min, max] = median === null ? [800, 1400] : [median - 200, median + 200];
  const tags = new Set(topTags.slice(0, 3).map(({ tag }) => tag));
  return ordered(
    problemset.flatMap((raw) => {
      const parsed = CandidateSchema.safeParse(raw);
      if (!parsed.success) return [];
      const p = parsed.data;
      const id = `${p.contestId}${p.index}`;
      return p.rating >= min &&
        p.rating <= max &&
        p.tags.some((tag) => tags.has(tag)) &&
        !attempted.has(id)
        ? [{ ...p, id }]
        : [];
    }),
  );
}

// Rule-based reports allow fewer than five candidates and retain the entire stats attention list.
const ReportSchema = z.strictObject({
  headline: z.string().min(1).max(200),
  weak_topics: z.array(z.strictObject({ topic: z.string(), insight: z.string() })).max(3),
  attention: z.array(z.strictObject({ handle: z.string(), suggestion: z.string().min(1) })),
  recommended: z.array(z.strictObject({ problem_id: z.string(), why: z.string().min(1) })).max(5),
  session_plan: z.array(z.string().min(1)).min(3).max(5),
});
export function buildWeeklyReport(stats: Stats, candidates: Candidate[], locale: "en" | "ar-EG") {
  const tr = (key: Parameters<typeof t<"report">>[0]) => t(key, locale, "report");
  const number = new Intl.NumberFormat(locale);
  const isolate = (tag: string) => (locale === "ar-EG" ? `\u2066${tag}\u2069` : tag);
  const why = (tag: string) => {
    const key =
      (["math", "brute force", "implementation", "binary search", "dp", "greedy"] as const).find(
        (key) => key === tag,
      ) ?? "other";
    return t(key, locale, "report_why").replace("{tag}", () => isolate(tag));
  };
  const topics = stats.topTags.slice(0, 3);
  return {
    headline: tr("headline")
      .replace("{solved}", number.format(stats.solved))
      .replace("{attempts}", number.format(stats.attempts)),
    weak_topics: topics.map(({ tag }) => ({ topic: tag, insight: why(tag) })),
    attention: stats.attention.map((row) => ({
      handle: row.handle,
      suggestion: [
        row.unsolved >= 3 ? tr("attention_unsolved") : "",
        row.avgHintLevelAtSolve >= 3.5 ? tr("attention_hints") : "",
      ]
        .filter(Boolean)
        .join(" "),
    })),
    recommended: ordered(candidates)
      .slice(0, 5)
      .map((p) => ({
        problem_id: p.id,
        why: why(topics.find(({ tag }) => p.tags.includes(tag))!.tag),
      })),
    session_plan: [
      tr("session_review"),
      ...(topics.length
        ? topics.map(({ tag }) =>
            tr("session_topic")
              .replace("{minutes}", number.format(60 / topics.length))
              .replace("{tag}", () => isolate(tag)),
          )
        : [tr("session_practice")]),
      tr("session_reflect"),
    ],
  };
}
export function validateWeeklyReport(report: unknown, candidates: Candidate[], handles: string[]) {
  const parsed = ReportSchema.safeParse(report);
  if (!parsed.success) return false;
  const ids = parsed.data.recommended.map((p) => p.problem_id);
  const allowed = new Set(candidates.map((p) => p.id));
  return (
    new Set(ids).size === ids.length &&
    ids.every((id) => allowed.has(id)) &&
    parsed.data.attention.every((row) => handles.includes(row.handle))
  );
}
