import type { Problem } from "@/src/db/repo/problems";
import { t } from "@/src/i18n";

export function StatementPanel({ problem, locale }: { problem: Problem; locale: "en" | "ar-EG" }) {
  return (
    <details className="card p-5">
      <summary className="cursor-pointer font-semibold">{t("title", locale, "statement")}</summary>
      <div className="space-y-4 pt-4">
        <p dir="ltr" className="whitespace-pre-wrap">
          {problem.statementMd}
        </p>
        {(["inputSpecMd", "outputSpecMd"] as const).map((field) => (
          <section key={field}>
            <h2 className="font-semibold">{t(field, locale, "statement")}</h2>
            <pre dir="ltr" className="overflow-x-auto whitespace-pre-wrap font-sans">
              {problem[field]}
            </pre>
          </section>
        ))}
        {problem.samples.map((sample, index) => (
          <section key={index} className="space-y-2">
            <h2 className="font-semibold">
              {t("sample", locale, "statement")} {index + 1}
            </h2>
            {(["input", "output"] as const).map((field) => (
              <div key={field}>
                <h3>{t(field, locale)}</h3>
                <pre
                  dir="ltr"
                  className="overflow-x-auto rounded-lg border border-line bg-canvas p-3"
                >
                  {sample[field]}
                </pre>
              </div>
            ))}
          </section>
        ))}
      </div>
    </details>
  );
}
