import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { connect, getDb } from "@/src/db/client";
import { getProblem } from "@/src/db/repo/problems";
import { attempts, diagnoses } from "@/src/db/schema";
import { DiagnosisCard } from "@/src/components/diagnosis-card";
import { DiagnosisSchema, toPublic } from "@/src/llm/schemas/diagnosis";
import { t } from "@/src/i18n";

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await connect(getDb());
  const attempt = await db.select().from(attempts).where(eq(attempts.id, id)).get();
  const problem = attempt && (await getProblem(db, attempt.problemId));
  if (!attempt || !problem) notFound();
  const diagnosis = await db.select().from(diagnoses).where(eq(diagnoses.attemptId, id)).get();
  return (
    <main className="ms-auto me-auto max-w-3xl space-y-4 ps-6 pe-6 py-10">
      <h1 dir="ltr" className="text-2xl font-bold">
        {problem.title}
      </h1>
      <p>
        {t("attemptId", attempt.locale)}:{" "}
        <code dir="ltr" className="bidi-isolate">
          {id}
        </code>
      </p>
      <DiagnosisCard
        id={id}
        code={attempt.code}
        language={attempt.language}
        locale={attempt.locale}
        initial={
          diagnosis ? toPublic(DiagnosisSchema.parse(JSON.parse(diagnosis.resultJson))) : undefined
        }
      />
    </main>
  );
}
