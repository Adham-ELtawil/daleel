import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/src/db/client";
import {
  getProblem,
  getProblemByExternalId,
  insertProblem,
  type NewProblem,
} from "@/src/db/repo/problems";
import { tempDb } from "./helpers";

let db: Db;
let cleanup: () => void;
beforeEach(async () => ({ db, cleanup } = await tempDb()));
afterEach(() => cleanup());

const watermelon: NewProblem = {
  judge: "codeforces",
  externalId: "4A",
  url: "https://codeforces.com/problemset/problem/4/A",
  title: "Watermelon",
  statementMd: "Split w into two even positive parts.",
  inputSpecMd: "One integer w (1 ≤ w ≤ 100).",
  outputSpecMd: "YES or NO.",
  notesMd: null,
  samples: [{ input: "8\n", output: "YES\n" }],
  timeLimitMs: 1000,
  memoryLimitMb: 64,
  rating: 800,
  tags: ["brute force", "math"],
  contestId: "4",
};

describe("problems repo", () => {
  it("inserts a problem and reads it back by id with parsed JSON columns", async () => {
    const { id } = await insertProblem(db, watermelon, 1_000);
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID
    const problem = await getProblem(db, id);
    expect(problem).toMatchObject({ ...watermelon, id, fetchedAt: 1_000 });
    expect(problem?.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("finds a problem by (judge, external_id)", async () => {
    const { id } = await insertProblem(db, watermelon, 1_000);
    expect((await getProblemByExternalId(db, "codeforces", "4A"))?.id).toBe(id);
    expect(await getProblemByExternalId(db, "atcoder", "4A")).toBeUndefined();
  });

  it("enforces UNIQUE(judge, external_id)", async () => {
    await insertProblem(db, watermelon, 1_000);
    await expect(insertProblem(db, { ...watermelon, title: "dup" }, 2_000)).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/UNIQUE/) },
    });
    await expect(
      insertProblem(db, { ...watermelon, judge: "atcoder" }, 2_000),
    ).resolves.toHaveProperty("id");
  });

  it("rejects invalid samples before writing", async () => {
    const bad = { ...watermelon, samples: [{ input: "8" }] } as unknown as NewProblem;
    await expect(insertProblem(db, bad, 1_000)).rejects.toThrow();
    expect(await getProblemByExternalId(db, "codeforces", "4A")).toBeUndefined();
  });

  it("returns undefined for an unknown id", async () => {
    expect(await getProblem(db, "01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBeUndefined();
  });
});
