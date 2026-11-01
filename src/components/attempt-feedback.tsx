import React from "react";
import { t } from "@/src/i18n";

export function LoadingSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" className="card space-y-3 p-4">
      <p>{label}</p>
      <div aria-hidden="true" className="space-y-2 motion-safe:animate-pulse">
        <div className="h-3 w-3/4 rounded bg-line" />
        <div className="h-3 w-1/2 rounded bg-line" />
      </div>
    </div>
  );
}

export function DiagnosisError({
  code,
  locale,
  heading = "diagnosis_error",
}: {
  code: Parameters<typeof t>[0];
  locale: "en" | "ar-EG";
  heading?: "diagnosis_error" | "ideaTitle";
}) {
  return (
    <section role="alert" className="card space-y-2 border-warning/30 bg-amber-50 p-4">
      <h2 className="font-semibold">{t(heading, locale)}</h2>
      <p>{t(code, locale)}</p>
    </section>
  );
}
