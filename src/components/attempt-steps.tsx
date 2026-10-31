import React from "react";
import { t } from "@/src/i18n";

const steps = ["diagnosis", "counterexample", "hints", "explanation"] as const;
type Locale = "en" | "ar-EG";

export function StepHeading({ step, locale }: { step: 1 | 2 | 3 | 4; locale: Locale }) {
  return (
    <h2 className="step-heading">
      <span className="step-number">{step}</span>
      {t(steps[step - 1], locale, "attemptFlow")}
    </h2>
  );
}

export function AttemptStepper({
  complete,
  locale,
}: {
  complete: [boolean, boolean, boolean, boolean];
  locale: Locale;
}) {
  const current = complete.indexOf(false);
  return (
    <ol aria-label={t("progress", locale, "attemptFlow")} className="attempt-stepper">
      {steps.map((step, index) => {
        const state = complete[index] ? "complete" : index === current ? "current" : "pending";
        return (
          <li key={step} data-state={state} aria-current={state === "current" ? "step" : undefined}>
            <span aria-hidden="true" className="step-number">
              {complete[index] ? "✓" : index + 1}
            </span>
            {t(step, locale, "attemptFlow")}
            <span className="sr-only">: {t(state, locale, "attemptFlow")}</span>
          </li>
        );
      })}
    </ol>
  );
}
