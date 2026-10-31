import { ulid } from "ulid";
import type { Problem } from "@/src/db/repo/problems";
import { createCfApi, isContestRunning } from "@/src/judges/cf-api";
import { HttpError } from "./http-error";

export const defaultCfApi = createCfApi({
  userAgent: process.env.SCRAPER_USER_AGENT ?? "Mozilla/5.0",
});
export type ContestGuardDeps = {
  cfApi?: Pick<ReturnType<typeof createCfApi>, "contestList">;
  log?: (code: string) => void;
};

export async function guardContest(
  problem: Pick<Problem, "judge" | "contestId">,
  deps: ContestGuardDeps,
) {
  if (problem.judge !== "codeforces" || problem.contestId === null) return;
  // Replay/demo mode must make zero network calls; recorded demo problems are past contests.
  if (process.env.DEMO_REPLAY === "1") return;
  let running: boolean;
  try {
    running = isContestRunning(
      Number(problem.contestId),
      await (deps.cfApi ?? defaultCfApi).contestList(),
    );
  } catch {
    (deps.log ?? ((code) => console.error({ requestId: ulid(), code })))("contest_check_failed");
    return;
  }
  if (running) throw new HttpError(423, "contest_running");
}
