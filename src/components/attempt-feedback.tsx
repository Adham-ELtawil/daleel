import React from "react";
import { t } from "@/src/i18n";

export function LoadingSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" className="space-y-3 rounded border p-4">
      <p>{label}</p>
      <div aria-hidden="true" className="space-y-2 motion-safe:animate-pulse">
        <div className="h-3 w-3/4 rounded bg-gray-200" />
        <div className="h-3 w-1/2 rounded bg-gray-200" />
      </div>
    </div>
  );
}

export function DiagnosisError({
  code,
  locale,
}: {
  code: Parameters<typeof t>[0];
  locale: "en" | "ar-EG";
}) {
  return (
    <section role="alert" className="space-y-2 rounded border border-amber-300 bg-amber-50 p-4">
      <h2 className="font-semibold">{t("diagnosis_error", locale)}</h2>
      <p>{t(code, locale)}</p>
    </section>
  );
}
