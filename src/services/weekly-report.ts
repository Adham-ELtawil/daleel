import { eq } from "drizzle-orm";
import type { Db } from "@/src/db/client";
import { attempts, problems, teamMembers } from "@/src/db/schema";
import {
  buildWeeklyReport,
  reportCandidates,
  validateWeeklyReport,
} from "@/src/domain/weekly-report";
import cf from "@/tests/fixtures/cf-api/problemset.problems.json";
import { HttpError } from "./http-error";
import { teamStats } from "./teams";

export async function weeklyReport(
  db: Db,
  user: Parameters<typeof teamStats>[1],
  teamId: string,
  week: string | null,
  locale: "en" | "ar-EG",
) {
  const { stats } = await teamStats(db, user, teamId, week);
  // All member history matters for exclusions and the team's solved-rating baseline.
  const history = await db
    .select({
      judge: problems.judge,
      externalId: problems.externalId,
      rating: problems.rating,
      status: attempts.status,
    })
    .from(teamMembers)
    .innerJoin(attempts, eq(attempts.userId, teamMembers.userId))
    .innerJoin(problems, eq(problems.id, attempts.problemId))
    .where(eq(teamMembers.teamId, teamId));
  const candidates = reportCandidates(cf.result.problems, stats.topTags, history);
  const report = buildWeeklyReport(stats, candidates, locale);
  const handles = stats.trainees.map((row) => row.handle);
  if (!validateWeeklyReport(report, candidates, handles))
    throw new HttpError(500, "internal_error");
  return { stats, candidates, report };
}
