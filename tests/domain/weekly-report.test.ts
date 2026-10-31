import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { weeklyStats } from "@/src/domain/weekly-stats";
import fixture from "@/tests/fixtures/cf-api/problemset.problems.json";

async function reportModule() {
  const file = resolve("src/domain/weekly-report.ts");
  expect(existsSync(file), "Deterministic weekly report behaviour is missing").toBe(true);
  return import(file) as Promise<typeof import("@/src/domain/weekly-report")>;
}
const monday = Date.parse("2026-10-26T12:00:00Z");
const history = (ratings: (number | null)[]) =>
  ratings.map((rating, i) => ({
    judge: "codeforces",
    externalId: `solved_${i}`,
    status: "solved",
    rating,
  }));
const problems = (ratings: number[]) =>
  ratings.map((rating, i) => ({
    ...fixture.result.problems[0],
    contestId: 100 + i,
    index: "A",
    type: "PROGRAMMING" as const,
    rating,
    tags: ["math"],
  }));
const topTags = [{ tag: "math", count: 10 }];
const stats = () =>
  weeklyStats(
    [
      ...Array.from({ length: 3 }, () => ({
        handle: "trainee_stuck",
        status: "stuck",
        maxHintLevel: 0,
      })),
      { handle: "trainee_hints", status: "solved", maxHintLevel: 4 },
      ...Array.from({ length: 3 }, () => ({
        handle: "trainee_both",
        status: "stuck",
        maxHintLevel: 0,
      })),
      { handle: "trainee_both", status: "solved", maxHintLevel: 4 },
    ].map((row) => ({
      ...row,
      userId: row.handle,
      createdAt: monday,
      topics: ["math", "brute force"],
      bugClass: "edge_case",
    })),
    monday,
  );

describe("report candidates", () => {
  it("uses the median solved CF rating ±200, inclusively, ignoring unrated/unsolved/other judges", async () => {
    const { reportCandidates } = await reportModule();
    const solved = [
      ...history([1400, null, 1000]),
      { ...history([3000])[0], status: "stuck" },
      { ...history([3000])[0], judge: "atcoder" },
    ];
    const input = problems([999, 1000, 1200, 1400, 1401]);
    const before = structuredClone({ input, solved });
    expect(reportCandidates(input, topTags, solved).map((p) => p.rating)).toEqual([
      1000, 1200, 1400,
    ]);
    expect({ input, solved }).toEqual(before);
  });

  it("uses an odd median and defaults to 800–1400 only when no rated CF solves exist", async () => {
    const { reportCandidates } = await reportModule();
    const input = problems([799, 800, 1000, 1200, 1400, 1401]);
    expect(
      reportCandidates(input, topTags, history([1400, 800, 1000])).map((p) => p.rating),
    ).toEqual([800, 1000, 1200]);
    expect(reportCandidates(input, topTags, history([null])).map((p) => p.rating)).toEqual([
      800, 1000, 1200, 1400,
    ]);
  });

  it("requires a top-three weak tag and excludes every attempted CF id regardless of status", async () => {
    const { reportCandidates } = await reportModule();
    const input = problems([1000, 1000, 1000, 1000, 1000, 1000]);
    input[0].tags = ["graphs"];
    input[1].tags = ["dp"];
    input[2].tags = ["greedy"];
    input[3].tags = ["implementation"];
    const tags = ["math", "dp", "greedy", "implementation"].map((tag) => ({ tag, count: 1 }));
    const attempted = ["stuck", "new", "error"].map((status, i) => ({
      judge: "codeforces",
      externalId: `${101 + i}A`,
      status,
      rating: null,
    }));
    attempted.push({ judge: "atcoder", externalId: "104A", status: "stuck", rating: null });
    expect(reportCandidates(input, tags, attempted).map((p) => p.id)).toEqual(["104A", "105A"]);
    expect(reportCandidates(input, [], [])).toEqual([]);
  });

  it("drops unrated or unaddressable entries and deduplicates candidates without changing the saved fixture", async () => {
    const { reportCandidates } = await reportModule();
    const rated = problems([1000])[0];
    const unrated = { ...rated, rating: undefined };
    const unaddressable = { ...rated, contestId: undefined };
    expect(reportCandidates([unrated, unaddressable, rated, rated], topTags, [])).toHaveLength(1);
    const before = structuredClone(fixture);
    const candidates = reportCandidates(fixture.result.problems, topTags, []);
    expect(
      candidates.every((p) => p.rating >= 800 && p.rating <= 1400 && p.tags.includes("math")),
    ).toBe(true);
    expect(fixture).toEqual(before);
  });
});

it("picks five unique problems easier-to-harder with stable ties regardless of candidate order", async () => {
  const { reportCandidates, buildWeeklyReport } = await reportModule();
  const candidates = reportCandidates(
    problems([1300, 900, 800, 1200, 1000, 800, 1400]),
    topTags,
    [],
  );
  const first = buildWeeklyReport(stats(), candidates, "en");
  expect(first.recommended.map((p) => p.problem_id)).toEqual([
    "102A",
    "105A",
    "101A",
    "104A",
    "103A",
  ]);
  expect(buildWeeklyReport(stats(), [...candidates].reverse(), "en")).toEqual(first);
  expect(buildWeeklyReport(stats(), [], "en").recommended).toEqual([]);
});

it("uses the matched weak tag for the why sentence and each attention reason for its suggestion", async () => {
  const { reportCandidates, buildWeeklyReport } = await reportModule();
  const input = problems([1000, 1000]);
  input[0].tags = ["math"];
  input[1].tags = ["brute force"];
  const weekly = stats();
  const candidates = reportCandidates(input, weekly.topTags, []);
  const report = buildWeeklyReport(weekly, candidates, "en");
  expect(report.recommended.map((p) => p.why)).toEqual([
    "Practise math by checking small cases and numerical boundaries.",
    "Practise brute force by enumerating small cases systematically.",
  ]);
  expect(report.attention.map((row) => row.handle)).toEqual(
    weekly.attention.map((row) => row.handle),
  );
  const suggestion = (handle: string) =>
    report.attention.find((row) => row.handle === handle)!.suggestion;
  expect(suggestion("trainee_stuck")).toContain("unsolved");
  expect(suggestion("trainee_hints")).toContain("without hints");
  expect(suggestion("trainee_both")).toContain("unsolved");
  expect(suggestion("trainee_both")).toContain("without hints");
});

it.each([0, 1, 2, 3, 5])(
  "provides 3–5 localized session steps for %i weak topics",
  async (count) => {
    const { buildWeeklyReport } = await reportModule();
    const weekly = {
      ...stats(),
      topTags: ["math", "brute force", "dp", "graphs", "greedy"]
        .slice(0, count)
        .map((tag) => ({ tag, count: 2 })),
    };
    for (const locale of ["en", "ar-EG"] as const) {
      const report = buildWeeklyReport(weekly, [], locale);
      expect(report.session_plan).toHaveLength(2 + Math.max(1, Math.min(3, count)));
      for (const { tag } of weekly.topTags.slice(0, 3))
        expect(report.session_plan.join(" ")).toContain(tag);
      if (locale === "ar-EG") {
        for (const text of [
          report.headline,
          ...report.session_plan,
          ...report.attention.map((r) => r.suggestion),
        ]) {
          expect(text).toMatch(/^[\u0600-\u06ff]/);
          expect(text).not.toMatch(/[()\/→←]/);
        }
      }
    }
  },
);

it("validates structure, candidate membership, unique ids, and team handles", async () => {
  const { reportCandidates, buildWeeklyReport, validateWeeklyReport } = await reportModule();
  const candidates = reportCandidates(problems([1000, 1100, 1200, 1300, 1400]), topTags, []);
  const weekly = stats();
  const report = buildWeeklyReport(weekly, candidates, "en");
  const handles = weekly.trainees.map((row) => row.handle);
  expect(validateWeeklyReport(report, candidates, handles)).toBe(true);
  expect(
    validateWeeklyReport(
      { ...report, recommended: [{ problem_id: "missing", why: "fixture" }] },
      candidates,
      handles,
    ),
  ).toBe(false);
  expect(
    validateWeeklyReport(
      { ...report, recommended: [report.recommended[0], report.recommended[0]] },
      candidates,
      handles,
    ),
  ).toBe(false);
  expect(
    validateWeeklyReport(
      { ...report, attention: [{ handle: "outsider", suggestion: "fixture" }] },
      candidates,
      handles,
    ),
  ).toBe(false);
  expect(validateWeeklyReport({ ...report, session_plan: [] }, candidates, handles)).toBe(false);
  expect(validateWeeklyReport(null, candidates, handles)).toBe(false);
});
