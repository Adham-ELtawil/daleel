"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { cpp } from "@codemirror/lang-cpp";
import { z } from "zod";
import { diagnosisHighlights } from "@/src/domain/diagnosis-highlights";
import { shouldAutostart } from "@/src/domain/attempt-ui";
import { bugClassLabel, t } from "@/src/i18n";
import type { attemptDetail } from "@/src/services/attempt-service";
import { readSse } from "@/src/services/sse";
import { HintLadder } from "./hint-ladder";
import { ReplayBadge } from "./replay-badge";
import { StressResult } from "./stress-result";
import { DiagnosisError, LoadingSkeleton } from "./attempt-feedback";

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
  const [stress, setStress] = useState(detail.stress);
  const [ladderReady, setLadderReady] = useState(false);
  const autoStarted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"reading" | "thinking" | "validating" | undefined>(
    status === "diagnosing" ? "reading" : undefined,
  );
  const [error, setError] = useState<Parameters<typeof t>[0] | undefined>(
    status === "error" ? "llm_error" : undefined,
  );
  const [reset, setReset] = useState(false);
  const extensions = useMemo(
    () => [
      ...(language === "cpp17" ? [cpp()] : []),
      EditorView.contentAttributes.of({ dir: "ltr", "aria-labelledby": "attempt-code-label" }),
      diagnosisHighlights(result),
    ],
    [language, result],
  );
  const diagnose = useCallback(
    async (retry = false) => {
      setBusy(true);
      setReset(true);
      setError(undefined);
      setResult(undefined);
      setStress(undefined);
      setLadderReady(false);
      setStage("reading");
      try {
        const response = await fetch(`/api/attempts/${id}/diagnose`, {
          method: "POST",
          headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
          body: JSON.stringify({ retry }),
        });
        if (!response.ok) {
          const blocked = z
            .object({
              error: z.object({
                code: z.enum(["contest_running", "budget_reached", "llm_error", "already_running"]),
              }),
            })
            .safeParse(await response.json().catch(() => null));
          if (blocked.success) {
            setError(blocked.data.error.code);
            return;
          }
          throw new Error("diagnosis_failed");
        }
        if (!response.body) throw new Error("diagnosis_failed");
        await readSse(response.body, (event) => {
          if (event.event === "stage") setStage(event.data.name);
          if (event.event === "diagnosis")
            setResult({
              ...event.data.public,
              replay: event.data.replay,
              recordedAt: event.data.recordedAt,
            });
          if (event.event === "ladder_ready") setLadderReady(true);
          if (event.event === "stress") setStress(event.data.result);
          if (event.event === "error") setError(event.data.code);
        });
      } catch {
        setError("llm_error");
      } finally {
        setBusy(false);
        setStage(undefined);
      }
    },
    [id],
  );
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
      <button
        type="button"
        disabled={busy}
        onClick={() => diagnose(Boolean(result || error || reset || status !== "new"))}
        className="rounded border p-2"
      >
        {t(result || error || reset || status !== "new" ? "diagnose_again" : "diagnose", locale)}
      </button>
      <div aria-live="polite" className="space-y-2">
        {stage && !result && <LoadingSkeleton label={t(stage, locale)} />}
        {error && <DiagnosisError code={error} locale={locale} />}
        {busy && result && (stress || !result.bug_found) && !ladderReady && !error && (
          <LoadingSkeleton label={t("preparing_hints", locale)} />
        )}
        {result && (
          <article className="rounded border p-4">
            <ReplayBadge replay={result.replay} recordedAt={result.recordedAt} locale={locale} />
            <p dir="auto">{result.public_summary}</p>
            <p>
              {t("bug_class", locale)}: <bdi>{bugClassLabel(result.bug_class, locale)}</bdi>
            </p>
            <p>
              {t("confidence", locale)}:{" "}
              <bdi>
                {new Intl.NumberFormat(locale, { style: "percent" }).format(result.confidence)}
              </bdi>
            </p>
            {result.confidence < 0.6 && <p>{t("low_confidence", locale)}</p>}
            <StressResult
              result={stress}
              pending={busy && result.bug_found && !ladderReady && !error}
              locale={locale}
            />
          </article>
        )}
      </div>
      {!busy && !error && (
        <HintLadder
          detail={
            reset
              ? { ...detail, revealedHints: [], canExplain: false, replay: false, recordedAt: null }
              : detail
          }
          locale={locale}
          ready={ready}
        />
      )}
    </section>
  );
}
