import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { connect, getDb } from "@/src/db/client";
import { getProblem } from "@/src/db/repo/problems";
import { attempts } from "@/src/db/schema";
import { t } from "@/src/i18n";

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await connect(getDb());
  const attempt = await db
    .select({ problemId: attempts.problemId })
    .from(attempts)
    .where(eq(attempts.id, id))
    .get();
  const problem = attempt && (await getProblem(db, attempt.problemId));
  if (!problem) notFound();
  return (
    <main className="ms-auto me-auto max-w-3xl space-y-4 ps-6 pe-6 py-10">
      <h1 dir="ltr" className="text-2xl font-bold">
        {problem.title}
      </h1>
      <p>
        {t("attemptId")}:{" "}
        <code dir="ltr" className="bidi-isolate">
          {id}
        </code>
      </p>
      <p>{t("saved")}</p>
    </main>
  );
}
