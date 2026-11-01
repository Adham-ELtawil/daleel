import React from "react";
import type { StressPublic } from "@/src/domain/stress-public";
import { t } from "@/src/i18n";
import { LoadingSkeleton } from "./attempt-feedback";
import { StepHeading } from "./attempt-steps";

export function StressResult({
  result,
  pending = false,
  locale,
}: {
  result?: StressPublic;
  pending?: boolean;
  locale: "en" | "ar-EG";
}) {
  if (!result && pending) {
    return (
      <section aria-live="polite" className="card space-y-4 p-5">
        <StepHeading step={2} locale={locale} />
        <LoadingSkeleton label={t("pending", locale, "stress")} />
      </section>
    );
  }
  const verified = result?.status === "verified";
  return (
    <section aria-live="polite" className="card space-y-4 p-5">
      <StepHeading step={2} locale={locale} />
      {verified ? (
        <section className="space-y-3" aria-label={t("verified", locale, "stress")}>
          <span className="badge badge-success">{t("verified", locale, "stress")}</span>
          {(
            [
              ["input", result.failing_input],
              ["expected", result.expected_output],
              ["actual", result.actual_output],
            ] as const
          ).map(([label, output]) => (
            <div key={label}>
              <h3 className="text-sm">{t(label, locale, "stress")}</h3>
              <pre dir="ltr" className="overflow-x-auto rounded bg-canvas p-2 text-sm">
                {output ?? ""}
              </pre>
            </div>
          ))}
          <p className="text-xs text-muted">{t("verified_note", locale, "stress")}</p>
        </section>
      ) : (
        <>
          <span className="badge badge-neutral text-xs">{t("not_verified", locale, "stress")}</span>
          <p className="text-xs text-muted">{t(result?.status ?? "missing", locale, "stress")}</p>
          {result?.status === "compile_error" && (
            <pre dir="ltr" className="overflow-x-auto rounded bg-canvas p-2 text-sm">
              {(result.compile_output ?? "").split(/\r?\n/).slice(0, 30).join("\n")}
            </pre>
          )}
        </>
      )}
      {result?.contradiction && (
        <p className="text-xs text-muted">{t("contradiction", locale, "stress")}</p>
      )}
    </section>
  );
}
