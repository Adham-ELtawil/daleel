import React from "react";
import type { StressPublic } from "@/src/domain/stress-public";
import { t } from "@/src/i18n";
import { LoadingSkeleton } from "./attempt-feedback";

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
    return <LoadingSkeleton label={t("pending", locale, "stress")} />;
  }
  const verified = result?.status === "verified";
  return (
    <div className="mt-3 space-y-2">
      {verified ? (
        <section
          className="space-y-2 rounded border p-3"
          aria-label={t("verified", locale, "stress")}
        >
          <h2 className="font-semibold">{t("verified", locale, "stress")}</h2>
          {(
            [
              ["input", result.failing_input],
              ["expected", result.expected_output],
              ["actual", result.actual_output],
            ] as const
          ).map(([label, output]) => (
            <div key={label}>
              <h3 className="text-sm">{t(label, locale, "stress")}</h3>
              <pre dir="ltr" className="overflow-x-auto rounded bg-gray-50 p-2 text-sm">
                {output ?? ""}
              </pre>
            </div>
          ))}
          <p className="text-xs text-gray-600">{t("verified_note", locale, "stress")}</p>
        </section>
      ) : (
        <>
          <span className="inline-block rounded border ps-2 pe-2 py-1 text-xs">
            {t("not_verified", locale, "stress")}
          </span>
          <p className="text-xs text-gray-600">
            {t(result?.status ?? "missing", locale, "stress")}
          </p>
          {result?.status === "compile_error" && (
            <pre dir="ltr" className="overflow-x-auto rounded bg-gray-50 p-2 text-sm">
              {(result.compile_output ?? "").split(/\r?\n/).slice(0, 30).join("\n")}
            </pre>
          )}
        </>
      )}
      {result?.contradiction && (
        <p className="text-xs text-gray-600">{t("contradiction", locale, "stress")}</p>
      )}
    </div>
  );
}
