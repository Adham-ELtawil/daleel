import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, expect, it } from "vitest";

type Row = {
  userId: string;
  handle: string;
  createdAt: number;
  status: string;
  maxHintLevel: number;
  topics: string[];
  bugClass: string | null;
};
type Summary = {
  attempts: number;
  solved: number;
  solvedRate: number;
  avgHintLevelAtSolve: number;
};
type Stats = Summary & {
  weekStart: string;
  topTags: { tag: string; count: number }[];
  topBugClasses: { bugClass: string; count: number }[];
  trainees: (Summary & { userId: string; handle: string; unsolved: number })[];
  attention: Stats["trainees"];
};
let weeklyStats: (rows: Row[], week: number) => Stats;
beforeEach(async () => {
  const path = resolve("src/domain/weekly-stats.ts");
  expect(existsSync(path), "Weekly stats behaviour is missing").toBe(true);
  ({ weeklyStats } = await import(path));
});
const row = (fields: Partial<Row> = {}): Row => ({
  userId: "trainee_01",
  handle: "trainee_01",
  createdAt: Date.parse("2026-11-02T10:00:00Z"),
  status: "diagnosed",
  maxHintLevel: 0,
  topics: ["math"],
  bugClass: "edge_case",
  ...fields,
});
const week = Date.parse("2026-11-04T12:00:00Z");

it.each([
  ["2026-01-05", "2026-01-04T22:00:00Z", "2026-01-11T22:00:00Z"],
  ["2026-07-06", "2026-07-05T21:00:00Z", "2026-07-12T21:00:00Z"],
  ["2026-04-20", "2026-04-19T22:00:00Z", "2026-04-26T21:00:00Z"],
  ["2026-10-26", "2026-10-25T21:00:00Z", "2026-11-01T22:00:00Z"],
])("uses Cairo Monday boundaries for %s, including DST changes", (date, start, end) => {
  const first = Date.parse(start);
  const last = Date.parse(end);
  const rows = [first - 1, first, last - 1, last].map((createdAt) => row({ createdAt }));
  expect(weeklyStats(rows, first)).toMatchObject({ weekStart: date, attempts: 2 });
  expect(weeklyStats(rows, last - 1)).toMatchObject({ weekStart: date, attempts: 2 });
  expect(weeklyStats(rows, first - 1).weekStart).not.toBe(date);
  expect(weeklyStats(rows, last).weekStart).not.toBe(date);
});
it("counts solves and averages hints only on solved attempts without mutating rows", () => {
  const rows = [
    row({ status: "solved", maxHintLevel: 0 }),
    row({ status: "solved", maxHintLevel: 3 }),
    row({ maxHintLevel: 4 }),
  ];
  const original = structuredClone(rows);
  expect(weeklyStats(rows, week)).toMatchObject({
    attempts: 3,
    solved: 2,
    solvedRate: 2 / 3,
    avgHintLevelAtSolve: 1.5,
  });
  expect(rows).toEqual(original);
});
it("returns zeros and empty lists for a week without attempts", () => {
  expect(weeklyStats([], week)).toEqual({
    weekStart: "2026-11-02",
    attempts: 0,
    solved: 0,
    solvedRate: 0,
    avgHintLevelAtSolve: 0,
    topTags: [],
    topBugClasses: [],
    trainees: [],
    attention: [],
  });
});
it("flags three unsolved attempts or solved-hint average at least 3.5, but not smaller values", () => {
  const rows = [
    ...["new", "stuck", "error"].map((status) => row({ status })),
    ...[3, 4].map((maxHintLevel) =>
      row({ userId: "trainee_02", handle: "trainee_02", status: "solved", maxHintLevel }),
    ),
    ...[3, 3, 4].map((maxHintLevel) =>
      row({ userId: "trainee_03", handle: "trainee_03", status: "solved", maxHintLevel }),
    ),
    ...[1, 2].map(() => row({ userId: "trainee_04", handle: "trainee_04" })),
  ];
  const stats = weeklyStats(rows, week);
  expect(stats.attention.map((trainee) => trainee.handle)).toEqual(["trainee_01", "trainee_02"]);
  expect(stats.trainees).toHaveLength(4);
  expect(stats.attention[0]).toMatchObject({ unsolved: 3 });
  expect(stats.attention[1]).toMatchObject({ avgHintLevelAtSolve: 3.5 });
});
it("ranks diagnosis topics and bugs deterministically, caps at five/three, and counts each topic once per attempt", () => {
  const rows = [
    row({
      topics: ["math", "math", "greedy", "dp", "sort", "graphs", "strings"],
      bugClass: "logic",
    }),
    row({ topics: ["math", "greedy"], bugClass: "edge_case" }),
    row({ topics: ["math"], bugClass: "overflow" }),
    row({ topics: [], bugClass: "logic" }),
    row({ topics: [], bugClass: "complexity" }),
    row({ topics: [], bugClass: null }),
  ];
  expect(weeklyStats(rows, week).topTags).toEqual([
    { tag: "math", count: 3 },
    { tag: "greedy", count: 2 },
    { tag: "dp", count: 1 },
    { tag: "graphs", count: 1 },
    { tag: "sort", count: 1 },
  ]);
  expect(weeklyStats(rows, week).topBugClasses).toEqual([
    { bugClass: "logic", count: 2 },
    { bugClass: "complexity", count: 1 },
    { bugClass: "edge_case", count: 1 },
  ]);
});
