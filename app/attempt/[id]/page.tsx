import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { connect, getDb } from "@/src/db/client";
import { DiagnosisCard } from "@/src/components/diagnosis-card";
import { attemptDetail } from "@/src/services/attempt-service";
import { HttpError } from "@/src/services/http-error";
import { callModel } from "@/src/services/runtime";
import { ladderStepConfig } from "@/src/llm/prompts/ladder";
import { uiLocale } from "@/src/services/ui-locale";
import { t } from "@/src/i18n";

export default async function AttemptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ autostart?: string | string[] }>;
}) {
  const { id } = await params;
  const locale = await uiLocale();
  const detail = await attemptDetail(
    {
      db: await connect(getDb()),
      cookie: (await headers()).get("cookie"),
      now: Date.now,
      ladder: { llm: callModel, config: ladderStepConfig(process.env) },
    },
    id,
    locale,
  ).catch((error: unknown) => {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  });
  if (!detail.problem) notFound();
  return (
    <main className="ms-auto me-auto max-w-3xl space-y-4 ps-6 pe-6 py-10">
      <h1 dir="ltr" className="text-2xl font-bold">
        {detail.problem.title}
      </h1>
      <p>
        {t("attemptId", locale)}:{" "}
        <code dir="ltr" className="bidi-isolate">
          {id}
        </code>
      </p>
      <DiagnosisCard
        key={`${id}:${locale}`}
        detail={detail}
        locale={locale}
        autostart={(await searchParams).autostart}
      />
    </main>
  );
}
