import { readFile } from "node:fs/promises";
import type { Db } from "@/src/db/client";
import { getProblemByExternalId } from "@/src/db/repo/problems";
import { examples } from "@/src/demo/examples";
import { getCurrentUser } from "./current-user";
import { HttpError } from "./http-error";

export async function demoSession(db: Db) {
  await getCurrentUser(db);
  return {
    examples: await Promise.all(
      examples.map(async (example) => {
        const problem = await getProblemByExternalId(db, example.judge, example.id);
        if (!problem) throw new HttpError(404, "not_found");
        return {
          problemId: problem.id,
          judge: example.judge,
          externalId: example.id,
          title: problem.title,
          locale: example.locale,
          code: await readFile(`docs/examples/${example.path}/student.cpp`, "utf8"),
        };
      }),
    ),
  };
}
