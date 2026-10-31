import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { weeklyStats } from "@/src/domain/weekly-stats";
import { DiagnosisSchema } from "@/src/llm/schemas/diagnosis";
import cf from "@/tests/fixtures/cf-api/problemset.problems.json";
import a from "@/tests/fixtures/llm/diagnosis-a.json";
import b from "@/tests/fixtures/llm/diagnosis-b.json";
import type { Db } from "./client";
import { TagsSchema } from "./json";
import { getProblemByExternalId } from "./repo/problems";
import { attempts, diagnoses, teamMembers, users } from "./schema";

// Synthetic records only: no model calls or execution. Stable slots refresh two Cairo weeks.
export async function seedDemoTeam(db: Db, teamId: string, now: number) {
  const examples = await Promise.all(
    (
      [
        ["4A", "cf-4A-watermelon", a],
        ["1A", "cf-1A-theatre-square", b],
      ] as const
    ).map(async ([id, path, diagnosis]) => {
      const problem = await getProblemByExternalId(db, "codeforces", id);
      const metadata = cf.result.problems.find((p) => `${p.contestId}${p.index}` === id)!;
      return {
        problemId: problem!.id,
        code: await readFile(`docs/examples/${path}/student.cpp`, "utf8"),
        diagnosis: DiagnosisSchema.parse({ ...diagnosis, topics: TagsSchema.parse(metadata.tags) }),
      };
    }),
  );
  const monday = Date.parse(`${weeklyStats([], now).weekStart}T00:00:00Z`);
  const hour = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Cairo",
    hour: "numeric",
    hourCycle: "h23",
  });
  const starts = [monday, monday - 7 * 86400000].map(
    (day) => day - Number(hour.format(day)) * 3600000,
  );
  await db.transaction(async (tx) => {
    for (let trainee = 1; trainee <= 20; trainee++) {
      const handle = `trainee_${String(trainee).padStart(2, "0")}`;
      await tx
        .insert(users)
        .values({
          id: handle,
          handle,
          role: "student",
          locale: "en",
          isGuest: 0,
          createdAt: starts[1],
        })
        .onConflictDoNothing({ target: users.handle });
      const user = (await tx.select().from(users).where(eq(users.handle, handle)).get())!;
      await tx
        .insert(teamMembers)
        .values({ teamId, userId: user.id, joinedAt: starts[1] })
        .onConflictDoNothing();
      for (const [week, start] of starts.entries())
        for (let slot = 0; slot < 3; slot++) {
          const id = `demo_${handle}_${week}_${slot}`;
          const example = examples[(trainee + slot + week) % examples.length];
          const createdAt = Math.min(now, start + (slot * 48 + trainee) * 3600000);
          const solved =
            trainee % 5 !== 1 && (trainee % 5 === 2 || (trainee + slot + week) % 3 !== 0);
          const code = `${example.code}\n// Synthetic demo: ${id}\n`;
          const attempt = {
            userId: user.id,
            problemId: example.problemId,
            code,
            codeHash: createHash("sha256").update(code).digest("hex"),
            language: "cpp17" as const,
            locale: (example.diagnosis.bug_class === "overflow" ? "ar-EG" : "en") as "ar-EG" | "en",
            status: solved ? ("solved" as const) : ("stuck" as const),
            maxHintLevel: trainee % 5 === 2 ? 4 : (trainee + slot) % 4,
            solvedAt: solved ? createdAt : null,
            createdAt,
          };
          await tx
            .insert(attempts)
            .values({ id, ...attempt })
            .onConflictDoUpdate({ target: attempts.id, set: attempt });
          const diagnosis = {
            attemptId: id,
            resultJson: JSON.stringify(example.diagnosis),
            topicsJson: JSON.stringify(example.diagnosis.topics),
            bugClass: example.diagnosis.bug_class,
            confidence: example.diagnosis.confidence,
            model: "synthetic-demo",
            reasoningEffort: "none",
            createdAt,
          };
          await tx
            .insert(diagnoses)
            .values({ id, ...diagnosis })
            .onConflictDoUpdate({ target: diagnoses.id, set: diagnosis });
        }
    }
  });
}
