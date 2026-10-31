import React from "react";
import type { Explanation as ExplanationData } from "@/src/llm/schemas/explanation";
import { t } from "@/src/i18n";
import { SafeMd } from "./safe-md";
import { Walkthrough } from "./walkthrough";
import { StepHeading } from "./attempt-steps";

export function Explanation({
  explanation,
  trace,
  code,
  locale,
}: {
  explanation: Omit<ExplanationData, "trace">;
  trace: ExplanationData["trace"];
  code: string;
  locale: "en" | "ar-EG";
}) {
  return (
    <article id="explanation" className="card scroll-mt-24 space-y-5 p-5">
      <StepHeading step={4} locale={locale} />
      <SafeMd text={explanation.explanation_md} />
      {explanation.fix.length > 0 && (
        <section>
          <h3>{t("fix", locale, "walkthrough")}</h3>
          <ul className="space-y-2">
            {explanation.fix.map((fix, index) => (
              <li key={index} dir="ltr" className="overflow-x-auto text-sm">
                <span>
                  {t("line", locale, "walkthrough")} {fix.line}:{" "}
                </span>
                <code dir="ltr" className="bidi-isolate whitespace-pre-wrap">
                  <del className="block rounded bg-red-50 p-2 text-danger">{fix.old}</del>
                  <ins className="mt-1 block rounded bg-green-50 p-2 text-success no-underline">
                    {fix.new}
                  </ins>
                </code>
              </li>
            ))}
          </ul>
        </section>
      )}
      {explanation.complexity_note && (
        <section>
          <h3>{t("complexity", locale, "walkthrough")}</h3>
          <SafeMd text={explanation.complexity_note} />
        </section>
      )}
      <Walkthrough trace={trace} code={code} locale={locale} />
    </article>
  );
}
