"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { cpp } from "@codemirror/lang-cpp";
import { appendHint, nextHintLevel, type Hint } from "@/src/domain/attempt-ui";
import { t } from "@/src/i18n";
import type { attemptDetail } from "@/src/services/attempt-service";
import { HttpError } from "@/src/services/http-error";
import { HintRow } from "./ui/hint-row";
import { Window } from "./ui/window";
import { ReplayBadge } from "./replay-badge";
import { Explanation } from "./explanation";
import type { explainAttempt } from "@/src/services/explain-service";
import { AttemptStepper, StepHeading } from "./attempt-steps";
import { LoadingSkeleton, DiagnosisError } from "./attempt-feedback";

export function HintLadder({
  detail,
  locale,
  ready,
  onProgress,
  pipeline,
}: {
  detail: Awaited<ReturnType<typeof attemptDetail>>;
  locale: "en" | "ar-EG";
  ready: boolean;
  onProgress?: (progress: { hints: boolean; explanation: boolean }) => void;
  pipeline?: {
    diagnosis: ReactNode;
    counterexample: ReactNode;
    complete: [boolean, boolean];
    paused: boolean;
    preparing: boolean;
  };
}) {
  const router = useRouter();
  const { attempt } = detail;
  const idea = attempt.mode === "idea";
  const actions = idea ? [] : (["stuck", "solved", "fixed_recheck"] as const);
  const [fresh, setFresh] = useState<number>();
  const [hints, setHints] = useState(detail.revealedHints);
  const [provenance, setProvenance] = useState({
    replay: detail.replay,
    recordedAt: detail.recordedAt,
  });
  const [canExplain, setCanExplain] = useState(!idea && detail.canExplain);
  const [explanation, setExplanation] = useState<Awaited<ReturnType<typeof explainAttempt>>>();
  useEffect(() => {
    onProgress?.({ hints: canExplain, explanation: canExplain && Boolean(explanation) });
  }, [canExplain, explanation, onProgress]);
  const [explainError, setExplainError] = useState(false);
  const [solved, setSolved] = useState(attempt.status === "solved");
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState(attempt.code);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Parameters<typeof t>[0]>();
  const next = nextHintLevel(hints);
  const extensions = useMemo(
    () => [
      ...(attempt.language === "cpp17" ? [cpp()] : []),
      EditorView.contentAttributes.of({ dir: "ltr", "aria-labelledby": "recheck-code-label" }),
    ],
    [attempt.language],
  );
  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: T & { error?: { code: Parameters<typeof t>[0] } } = await response.json();
    if (!response.ok) throw new HttpError(response.status, data.error?.code ?? "internal_error");
    return data;
  }
  async function act(action: "hint" | "stuck" | "solved" | "recheck" | "explain") {
    setBusy(true);
    setError(undefined);
    setExplainError(false);
    try {
      const path = `/api/attempts/${attempt.id}`;
      if (action === "hint") {
        const { hint, replay, recordedAt } = await post<{
          hint: Hint;
          replay: boolean;
          recordedAt: string | null;
        }>(`${path}/hints/next`, { locale });
        setProvenance({ replay, recordedAt });
        setFresh(hint.level);
        setHints((previous) => appendHint(previous, hint));
        if (!idea && hint.level >= 3) setCanExplain(true);
      } else if (action === "explain") {
        setExplanation(await post(`${path}/explain`, { locale }));
      } else if (action === "recheck") {
        const { attemptId } = await post<{ attemptId: string }>("/api/attempts", {
          problemId: attempt.problemId,
          language: attempt.language,
          code,
          parentAttemptId: attempt.id,
        });
        router.push(`/attempt/${attemptId}?autostart=1`);
      } else {
        await post(`${path}/${action}`, {});
        setSolved(action === "solved");
        setCanExplain(action === "stuck" || hints.length >= 3);
      }
    } catch (failure) {
      if (action === "explain") setExplainError(true);
      else setError(failure instanceof HttpError ? failure.code : "internal_error");
    } finally {
      setBusy(false);
    }
  }
  const hintPanel = (
    <>
      <section className="space-y-4" aria-label={t("hints", locale)} aria-live="polite">
        {idea ? (
          <h2 className="text-xl font-semibold">{t("ideaTitle", locale)}</h2>
        ) : (
          !pipeline && <StepHeading step={3} locale={locale} />
        )}
        {hints.length > 0 && <ReplayBadge {...provenance} locale={locale} />}
        {hints.map((hint) => (
          <HintRow key={hint.level} hint={hint} fresh={fresh === hint.level} />
        ))}
        {pipeline?.preparing && <LoadingSkeleton label={t("preparing_hints", locale)} />}
        {solved && <p role="status">{t("solved_note", locale)}</p>}
        {canExplain && <p>{t("explanation_unlocked", locale)}</p>}
        {error &&
          (idea ? (
            <DiagnosisError code={error} locale={locale} heading="ideaTitle" />
          ) : (
            <DiagnosisError code={error} locale={locale} />
          ))}
        <div className="flex flex-wrap items-center gap-3">
          {ready && next !== null && (
            <button
              type="button"
              disabled={busy}
              className="button button-primary"
              onClick={() => act("hint")}
            >
              {t("hint", locale)} {next}
            </button>
          )}
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              disabled={busy || pipeline?.paused || (action === "solved" && solved)}
              className="button button-secondary button-small"
              onClick={() => (action === "fixed_recheck" ? setEditing(!editing) : act(action))}
            >
              {t(action === "fixed_recheck" && editing ? "cancel" : action, locale)}
            </button>
          ))}
        </div>
      </section>
    </>
  );
  function explainPanel() {
    return canExplain && explanation ? (
      <Explanation {...explanation} heading={!pipeline} code={attempt.code} locale={locale} />
    ) : (
      <div className="space-y-3">
        {explainError && (
          <p role="alert" className="state-panel state-error">
            {t("load_error", locale, "walkthrough")}
          </p>
        )}
        {canExplain ? (
          <button
            type="button"
            disabled={busy || pipeline?.paused}
            className="button button-secondary"
            onClick={() => act("explain")}
          >
            {t("full_explanation", locale, "walkthrough")}
          </button>
        ) : (
          <p className="text-sm text-muted">{t("locked", locale)}</p>
        )}
        {busy && canExplain && <LoadingSkeleton label={t("pending", locale)} />}
      </div>
    );
  }
  return (
    <div className="min-w-0 space-y-5">
      {pipeline ? (
        <AttemptStepper
          locale={locale}
          complete={[...pipeline.complete, canExplain, canExplain && Boolean(explanation)]}
        >
          {[pipeline.diagnosis, pipeline.counterexample, hintPanel, explainPanel()]}
        </AttemptStepper>
      ) : (
        <>
          {hintPanel}
          {!idea && canExplain && explainPanel()}
        </>
      )}
      {editing && (
        <form
          className="space-y-3 border-t border-line pt-5"
          onSubmit={(event) => {
            event.preventDefault();
            void act("recheck");
          }}
        >
          <label id="recheck-code-label">{t("updated_code", locale)}</label>
          <Window title={t(attempt.language === "cpp17" ? "student_cpp" : "student_py", locale)}>
            <CodeMirror
              theme="dark"
              value={code}
              onChange={setCode}
              extensions={extensions}
              height="240px"
              readOnly={busy}
              editable={!busy}
              indentWithTab={false}
            />
          </Window>
          <button type="submit" disabled={busy || !code.trim()} className="button button-secondary">
            {t(busy ? "pending" : "recheck", locale)}
          </button>
        </form>
      )}
    </div>
  );
}
