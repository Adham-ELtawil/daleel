import React from "react";
import type { StressPublic } from "@/src/domain/stress-public";
import { t } from "@/src/i18n";
import { LoadingSkeleton } from "./attempt-feedback";
import { Window } from "./ui/window";
import { JudgeOutput } from "./ui/judge-output";

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
      <section aria-live="polite" className="space-y-4">
        <LoadingSkeleton label={t("pending", locale, "stress")} />
      </section>
    );
  }
  const verified = result?.status === "verified";
  return (
    <section aria-live="polite" className="space-y-4">
      {verified ? (
        <section className="space-y-3" aria-label={t("verified", locale, "stress")}>
          <Window title={t("verified", locale, "stress")}>
            <JudgeOutput
              animate
              verdict={t("verdict", "en", "hero")}
              rows={[
                { label: t("input", locale, "stress"), value: result.failing_input ?? "" },
                {
                  label: t("expected", locale, "stress"),
                  value: result.expected_output ?? "",
                  tone: "expected",
                },
                {
                  label: t("actual", locale, "stress"),
                  value: result.actual_output ?? "",
                  tone: "got",
                },
              ]}
            />
          </Window>
          <p className="text-xs text-muted">{t("verified_note", locale, "stress")}</p>
        </section>
      ) : (
        <div
          className={`state-panel ${result?.status === "error" || result?.status === "compile_error" ? "state-error" : "state-empty"}`}
        >
          <span className="badge badge-neutral text-xs">{t("not_verified", locale, "stress")}</span>
          <p className="text-xs text-muted">{t(result?.status ?? "missing", locale, "stress")}</p>
          {result?.status === "compile_error" && (
            <pre dir="ltr" className="overflow-x-auto rounded bg-canvas p-2 text-sm">
              {(result.compile_output ?? "").split(/\r?\n/).slice(0, 30).join("\n")}
            </pre>
          )}
        </div>
      )}
      {result?.contradiction && (
        <p className="text-xs text-muted">{t("contradiction", locale, "stress")}</p>
      )}
    </section>
  );
}
