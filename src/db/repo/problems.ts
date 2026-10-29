import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import type { z } from "zod";
import type { Db } from "../client";
import { SamplesSchema, TagsSchema } from "../json";
import { problems } from "../schema";

export type NewProblem = Omit<
  typeof problems.$inferSelect,
  "id" | "contentHash" | "fetchedAt" | "samplesJson" | "tagsJson"
> & {
  samples: z.infer<typeof SamplesSchema>;
  tags: z.infer<typeof TagsSchema>;
};

export type Problem = NewProblem & { id: string; contentHash: string; fetchedAt: number };

export async function insertProblem(db: Db, p: NewProblem, now: number): Promise<{ id: string }> {
  const { samples, tags, ...fields } = p;
  const parsedSamples = SamplesSchema.parse(samples);
  const parsedTags = TagsSchema.parse(tags);
  const id = ulid(now);
  const contentHash = createHash("sha256")
    .update(
      JSON.stringify({
        title: p.title,
        statementMd: p.statementMd,
        inputSpecMd: p.inputSpecMd,
        outputSpecMd: p.outputSpecMd,
        notesMd: p.notesMd,
        samples: parsedSamples,
      }),
    )
    .digest("hex");
  await db.insert(problems).values({
    ...fields,
    id,
    contentHash,
    fetchedAt: now,
    samplesJson: JSON.stringify(parsedSamples),
    tagsJson: JSON.stringify(parsedTags),
  });
  return { id };
}

function readProblem(row: typeof problems.$inferSelect): Problem {
  const { samplesJson, tagsJson, ...fields } = row;
  return {
    ...fields,
    samples: SamplesSchema.parse(JSON.parse(samplesJson)),
    tags: TagsSchema.parse(JSON.parse(tagsJson)),
  };
}

export async function getProblem(db: Db, id: string): Promise<Problem | undefined> {
  const row = await db.select().from(problems).where(eq(problems.id, id)).get();
  return row ? readProblem(row) : undefined;
}

export async function getProblemByExternalId(
  db: Db,
  judge: NewProblem["judge"],
  externalId: string,
): Promise<Problem | undefined> {
  const row = await db
    .select()
    .from(problems)
    .where(and(eq(problems.judge, judge), eq(problems.externalId, externalId)))
    .get();
  return row ? readProblem(row) : undefined;
}
