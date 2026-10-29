import { createHash } from "node:crypto";
import type { Db } from "@/src/db/client";
import {
  getProblem,
  getProblemByExternalId,
  insertProblem,
  type NewProblem,
} from "@/src/db/repo/problems";
import { parseProblemUrl } from "@/src/judges/parse-url";
import { fetchProblemHtml } from "@/src/judges/fetch-page";
import { parseCodeforcesHtml } from "@/src/judges/codeforces";
import { parseAtcoderHtml } from "@/src/judges/atcoder";
import { createCfApi, isContestRunning, ratingAndTags } from "@/src/judges/cf-api";
import { HttpError } from "./http-error";

export async function resolveProblem(
  input: { url: string } | { statement: string },
  deps: {
    db: Db;
    fetch: typeof fetch;
    cfApi: Pick<ReturnType<typeof createCfApi>, "contestList" | "problemsetProblems">;
    now: () => number;
  },
) {
  const save = async (problem: NewProblem) => {
    const { id } = await insertProblem(deps.db, problem, deps.now());
    return (await getProblem(deps.db, id))!;
  };
  if ("statement" in input) {
    const externalId = createHash("sha256").update(input.statement).digest("hex").slice(0, 16);
    const cached = await getProblemByExternalId(deps.db, "custom", externalId);
    return (
      cached ??
      save({
        judge: "custom",
        externalId,
        url: null,
        title: input.statement
          .split(/\r?\n/)
          .find((line) => line.trim())!
          .trim()
          .slice(0, 120),
        statementMd: input.statement,
        inputSpecMd: "",
        outputSpecMd: "",
        notesMd: null,
        samples: [],
        timeLimitMs: 2000,
        memoryLimitMb: 256,
        rating: null,
        tags: [],
        contestId: null,
      })
    );
  }
  const parsed = parseProblemUrl(input.url);
  if (!parsed) throw new HttpError(422, "unsupported_url");
  const url = input.url.trim().includes("://") ? input.url.trim() : `https://${input.url.trim()}`;
  if (new URL(url).pathname.startsWith("/gym/")) throw new HttpError(502, "fetch_failed");
  const cached = await getProblemByExternalId(deps.db, parsed.judge, parsed.externalId);
  if (cached) return cached;
  let page: ReturnType<typeof parseCodeforcesHtml>;
  try {
    if (
      parsed.judge === "codeforces" &&
      isContestRunning(Number(parsed.contestId), await deps.cfApi.contestList())
    )
      throw new HttpError(423, "contest_running");
    const html = await fetchProblemHtml(url, {
      fetch: deps.fetch,
      userAgent: process.env.SCRAPER_USER_AGENT ?? "Mozilla/5.0",
    });
    page = (parsed.judge === "codeforces" ? parseCodeforcesHtml : parseAtcoderHtml)(html);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "fetch_failed");
  }
  let metadata: { rating: number | null; tags: string[] } = { rating: null, tags: [] };
  if (parsed.judge === "codeforces") {
    try {
      metadata = ratingAndTags(
        (await deps.cfApi.problemsetProblems()).problems,
        Number(parsed.contestId),
        parsed.index,
      );
    } catch {
      /* Metadata is optional; keep the parsed problem usable. */
    }
  }
  return save({
    ...page,
    ...metadata,
    judge: parsed.judge,
    externalId: parsed.externalId,
    contestId: parsed.contestId,
    url,
  });
}
