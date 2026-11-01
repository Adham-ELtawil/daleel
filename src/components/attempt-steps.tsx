import React, { type ReactNode } from "react";
import { t } from "@/src/i18n";

const steps = ["diagnosis", "counterexample", "hints", "explanation"] as const;
type Locale = "en" | "ar-EG";

export function StepHeading({ step, locale }: { step: 1 | 2 | 3 | 4; locale: Locale }) {
  return <h2 className="step-heading">{t(steps[step - 1], locale, "attemptFlow")}</h2>;
}

export function AttemptStepper({
  complete,
  locale,
  children,
}: {
  complete: [boolean, boolean, boolean, boolean];
  locale: Locale;
  children?: ReactNode[];
}) {
  const current = complete.indexOf(false);
  return (
    <ol aria-label={t("progress", locale, "attemptFlow")} className="attempt-rail">
      {steps.map((step, index) => {
        const state = complete[index] ? "complete" : index === current ? "current" : "pending";
        return (
          <li key={step} data-state={state} aria-current={state === "current" ? "step" : undefined}>
            <h2 className="rail-heading">
              <span aria-hidden="true" className="rail-node">
                {complete[index] ? "✓" : "•"}
              </span>
              {t(step, locale, "attemptFlow")}
              <span className="sr-only">: {t(state, locale, "attemptFlow")}</span>
            </h2>
            <div className="rail-content">{children?.[index]}</div>
          </li>
        );
      })}
    </ol>
  );
}
