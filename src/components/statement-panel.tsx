import type { Problem } from "@/src/db/repo/problems";
import { Window } from "./ui/window";
import { JudgeOutput } from "./ui/judge-output";
import { t } from "@/src/i18n";
import { MathText } from "./math";

export function StatementPanel({
  problem,
  locale,
  open = false,
}: {
  problem: Problem;
  locale: "en" | "ar-EG";
  open?: boolean;
}) {
  return (
    <details open={open} className="border-t border-line pt-5">
      <summary className="cursor-pointer font-semibold">{t("title", locale, "statement")}</summary>
      <div className="space-y-4 pt-4">
        <p dir="ltr" className="whitespace-pre-wrap">
          <MathText text={problem.statementMd} />
        </p>
        {(["inputSpecMd", "outputSpecMd"] as const).map((field) => (
          <section key={field}>
            <h3>{t(field, locale, "statement")}</h3>
            <p dir="ltr" className="whitespace-pre-wrap">
              <MathText text={problem[field]} />
            </p>
          </section>
        ))}
        {problem.notesMd !== null && (
          <p dir="ltr" className="whitespace-pre-wrap">
            <MathText text={problem.notesMd} />
          </p>
        )}
        {problem.samples.map((sample, index) => (
          <Window key={index} title={t("sample", locale, "statement") + " " + (index + 1)}>
            <JudgeOutput
              rows={[
                { label: t("input", locale), value: sample.input },
                { label: t("output", locale), value: sample.output },
              ]}
            />
          </Window>
        ))}
      </div>
    </details>
  );
}
