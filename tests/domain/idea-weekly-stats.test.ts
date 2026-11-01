import { expect, it } from "vitest";
import { weeklyStats } from "@/src/domain/weekly-stats";
import fixture from "@/tests/fixtures/coach/attempts.json";

const week = Date.parse("2026-11-02T12:00:00Z");
const code = fixture.map((row) => ({
  ...row,
  handle: row.userId,
  createdAt: week,
  mode: "code" as const,
}));
it("keeps fixture code statistics unchanged and counts idea help per trainee and in total", () => {
  const original = weeklyStats(code, week);
  expect(original).toMatchObject({
    attempts: 7,
    solved: 3,
    solvedRate: 3 / 7,
    avgHintLevelAtSolve: 8 / 3,
    ideaHelp: 0,
  });
  const ideas = [
    "trainee_01",
    "trainee_03",
    "trainee_03",
    "idea_only",
    "idea_only",
    "idea_only",
  ].map((userId, n) => ({
    ...code[0],
    userId,
    handle: userId,
    mode: "idea" as const,
    status: n % 2 ? "solved" : "stuck",
    maxHintLevel: 4,
    topics: ["spoiler"],
    bugClass: "spoiler",
  }));
  const stats = weeklyStats([...code, ...ideas], week);
  expect(stats).toMatchObject({
    attempts: original.attempts,
    solved: original.solved,
    solvedRate: original.solvedRate,
    avgHintLevelAtSolve: original.avgHintLevelAtSolve,
    ideaHelp: 6,
    topTags: original.topTags,
    topBugClasses: original.topBugClasses,
  });
  expect(stats.attention.map(({ handle }) => handle)).toEqual(
    original.attention.map(({ handle }) => handle),
  );
  for (const trainee of original.trainees)
    expect(stats.trainees.find(({ userId }) => userId === trainee.userId)).toMatchObject({
      ...trainee,
      ideaHelp: trainee.userId === "trainee_01" ? 1 : trainee.userId === "trainee_03" ? 2 : 0,
    });
  expect(stats.trainees.find(({ userId }) => userId === "idea_only")).toMatchObject({
    attempts: 0,
    solved: 0,
    unsolved: 0,
    solvedRate: 0,
    avgHintLevelAtSolve: 0,
    ideaHelp: 3,
  });
  expect(weeklyStats([...code, { ...ideas[0], createdAt: week - 8 * 86400000 }], week)).toEqual(
    original,
  );
});
