"use client";

import { useMemo, useState } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { cpp } from "@codemirror/lang-cpp";
import { diagnosisHighlights } from "@/src/domain/diagnosis-highlights";
import { t } from "@/src/i18n";
import type { DiagnosisPublic } from "@/src/llm/schemas/diagnosis";
import { readSse } from "@/src/services/sse";

export function DiagnosisCard({
  id,
  code,
  language,
  locale,
  initial,
}: {
  id: string;
  code: string;
  language: "cpp17" | "python3";
  locale: "en" | "ar-EG";
  initial?: DiagnosisPublic;
}) {
  const [result, setResult] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"reading" | "thinking" | "validating">();
  const [error, setError] = useState<Parameters<typeof t>[0]>();
  const extensions = useMemo(
    () => [
      ...(language === "cpp17" ? [cpp()] : []),
      EditorView.contentAttributes.of({ dir: "ltr", "aria-labelledby": "attempt-code-label" }),
      diagnosisHighlights(result),
    ],
    [language, result],
  );
  async function diagnose() {
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    setStage("reading");
    try {
      const response = await fetch(`/api/attempts/${id}/diagnose`, {
        method: "POST",
        headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok || !response.body) {
        throw new Error("diagnosis_failed");
      }
      await readSse(response.body, (event) => {
        if (event.event === "stage") setStage(event.data.name);
        if (event.event === "diagnosis") setResult(event.data.public);
        if (event.event === "error") setError(event.data.code);
      });
    } catch {
      setError("llm_error");
    } finally {
      setBusy(false);
      setStage(undefined);
    }
  }
  return (
    <section dir={locale === "en" ? "ltr" : "rtl"} className="space-y-4">
      <label id="attempt-code-label">{t("code", locale)}</label>
      <div dir="ltr" className="overflow-hidden rounded border">
        <CodeMirror
          value={code}
          extensions={extensions}
          readOnly
          height="300px"
          indentWithTab={false}
        />
      </div>
      <button type="button" disabled={busy} onClick={diagnose} className="rounded border p-2">
        {t(error ? "try_again" : "diagnose", locale)}
      </button>
      <div aria-live="polite" className="space-y-2">
        {stage && <p>{t(stage, locale)}</p>}
        {error && <p role="alert">{t(error, locale)}</p>}
        {result && (
          <article className="rounded border p-4">
            <p dir="auto">{result.public_summary}</p>
            <p>
              {t("bug_class", locale)}: <bdi>{result.bug_class}</bdi>
            </p>
            <p>
              {t("confidence", locale)}:{" "}
              <bdi>
                {new Intl.NumberFormat(locale, { style: "percent" }).format(result.confidence)}
              </bdi>
            </p>
            {result.confidence < 0.6 && <p>{t("low_confidence", locale)}</p>}
          </article>
        )}
      </div>
    </section>
  );
}
