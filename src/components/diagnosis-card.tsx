"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { cpp } from "@codemirror/lang-cpp";
import { diagnosisHighlights } from "@/src/domain/diagnosis-highlights";
import { shouldAutostart } from "@/src/domain/attempt-ui";
import { t } from "@/src/i18n";
import type { attemptDetail } from "@/src/services/attempt-service";
import { readSse } from "@/src/services/sse";
import { HintLadder } from "./hint-ladder";
import { ReplayBadge } from "./replay-badge";

export function DiagnosisCard({
  detail,
  locale,
  autostart,
}: {
  detail: Awaited<ReturnType<typeof attemptDetail>>;
  locale: "en" | "ar-EG";
  autostart?: string | string[];
}) {
  const {
    attempt: { id, code, language, status },
    diagnosis: initial,
  } = detail;
  const [result, setResult] = useState(initial);
  const [ladderReady, setLadderReady] = useState(false);
  const autoStarted = useRef(false);
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
  const diagnose = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    setLadderReady(false);
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
        if (event.event === "diagnosis")
          setResult({
            ...event.data.public,
            replay: event.data.replay,
            recordedAt: event.data.recordedAt,
          });
        if (event.event === "ladder_ready") setLadderReady(true);
        if (event.event === "error") setError(event.data.code);
      });
    } catch {
      setError("llm_error");
    } finally {
      setBusy(false);
      setStage(undefined);
    }
  }, [id]);
  useEffect(() => {
    if (!autoStarted.current && shouldAutostart(autostart, status, Boolean(initial))) {
      autoStarted.current = true;
      void diagnose();
    }
  }, [autostart, status, initial, diagnose]);
  const ready = ladderReady || (Boolean(result) && !busy);
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
            <ReplayBadge replay={result.replay} recordedAt={result.recordedAt} locale={locale} />
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
      <HintLadder detail={detail} locale={locale} ready={ready} />
    </section>
  );
}
