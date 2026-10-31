import React from "react";
import type { Explanation as ExplanationData } from "@/src/llm/schemas/explanation";
import { t } from "@/src/i18n";
import { SafeMd } from "./safe-md";
import { Walkthrough } from "./walkthrough";

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
    <article className="space-y-3 rounded border p-4">
      <h2 className="font-semibold">{t("full_explanation", locale, "walkthrough")}</h2>
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
                  <del>{fix.old}</del>
                  {" → "}
                  <ins>{fix.new}</ins>
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
