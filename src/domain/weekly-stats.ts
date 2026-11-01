type Row = {
  userId: string;
  handle: string;
  createdAt: number;
  status: string;
  maxHintLevel: number;
  topics: string[];
  bugClass: string | null;
  mode?: "code" | "idea";
};
const cairo = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Cairo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function weekOf(timestamp: number) {
  const parts = Object.fromEntries(
    cairo.formatToParts(timestamp).map(({ type, value }) => [type, value]),
  );
  // Calendar arithmetic on the Cairo date, never a fixed UTC offset or 168-hour week.
  const date = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
function summary(rows: Row[]) {
  const code = rows.filter((row) => row.mode !== "idea");
  const solved = code.filter((row) => row.status === "solved");
  return {
    attempts: code.length,
    ideaHelp: rows.length - code.length,
    solved: solved.length,
    solvedRate: code.length ? solved.length / code.length : 0,
    avgHintLevelAtSolve: solved.length
      ? solved.reduce((sum, row) => sum + row.maxHintLevel, 0) / solved.length
      : 0,
  };
}
function ranked(values: string[], limit: number) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort(([a, x], [b, y]) => y - x || a.localeCompare(b, "en")).slice(0, limit);
}
export function weeklyStats(rows: Row[], week: number) {
  const weekStart = weekOf(week);
  const selected = rows.filter((row) => weekOf(row.createdAt) === weekStart);
  const grouped = new Map<string, Row[]>();
  for (const row of selected) {
    if (!grouped.has(row.userId)) grouped.set(row.userId, []);
    grouped.get(row.userId)!.push(row);
  }
  const trainees = [...grouped]
    .map(([userId, attempts]) => {
      const stats = summary(attempts);
      const { handle } = attempts[0];
      return { userId, handle, ...stats, unsolved: stats.attempts - stats.solved };
    })
    .sort((a, b) => a.handle.localeCompare(b.handle, "en"));
  const code = selected.filter((row) => row.mode !== "idea");
  const tags = code.flatMap((row) => [...new Set(row.topics)]);
  const bugs = code.flatMap((row) => (row.bugClass ? [row.bugClass] : []));
  return {
    weekStart,
    ...summary(selected),
    topTags: ranked(tags, 5).map(([tag, count]) => ({ tag, count })),
    topBugClasses: ranked(bugs, 3).map(([bugClass, count]) => ({ bugClass, count })),
    trainees,
    attention: trainees.filter((row) => row.unsolved >= 3 || row.avgHintLevelAtSolve >= 3.5),
  };
}
