import React from "react";
import { t } from "@/src/i18n";

export function LoadingSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" className="skeleton space-y-3 py-4">
      <p>{label}</p>
      <div aria-hidden="true" className="space-y-2">
        <div className="skeleton-line w-3/4" />
        <div className="skeleton-line w-1/2" />
        <div className="skeleton-line w-5/6" />
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
    <section
      role="alert"
      className={`state-panel space-y-2 ${["budget_reached", "contest_running", "already_running"].includes(code) ? "state-warning" : "state-error"}`}
    >
      <h2 className="font-semibold">{t(heading, locale)}</h2>
      <p>{t(code, locale)}</p>
    </section>
  );
}
