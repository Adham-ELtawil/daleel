"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { cpp } from "@codemirror/lang-cpp";
import { appendHint, nextHintLevel, type Hint } from "@/src/domain/attempt-ui";
import { t } from "@/src/i18n";
import type { attemptDetail } from "@/src/services/attempt-service";
import { HttpError } from "@/src/services/http-error";
import { SafeMd } from "./safe-md";
import { ReplayBadge } from "./replay-badge";

export function HintLadder({
  detail,
  locale,
  ready,
}: {
  detail: Awaited<ReturnType<typeof attemptDetail>>;
  locale: "en" | "ar-EG";
  ready: boolean;
}) {
  const router = useRouter();
  const { attempt } = detail;
  const [hints, setHints] = useState(detail.revealedHints);
  const [provenance, setProvenance] = useState({
    replay: detail.replay,
    recordedAt: detail.recordedAt,
  });
  const [canExplain, setCanExplain] = useState(detail.canExplain);
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
  async function act(action: "hint" | "stuck" | "solved" | "recheck") {
    setBusy(true);
    setError(undefined);
    try {
      const path = `/api/attempts/${attempt.id}`;
      if (action === "hint") {
        const { hint, replay, recordedAt } = await post<{
          hint: Hint;
          replay: boolean;
          recordedAt: string | null;
        }>(`${path}/hints/next`, { locale });
        setProvenance({ replay, recordedAt });
        setHints((previous) => appendHint(previous, hint));
        if (hint.level >= 3) setCanExplain(true);
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
      setError(failure instanceof HttpError ? failure.code : "internal_error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4" aria-label={t("hints", locale)}>
      <div className="space-y-4" aria-live="polite">
        {hints.length > 0 && <ReplayBadge {...provenance} locale={locale} />}
        {hints.map((hint) => (
          <article key={hint.level} data-hint-level={hint.level} className="space-y-2 border p-4">
            <h2 dir="auto" className="font-semibold">
              {hint.title}
            </h2>
            <SafeMd text={hint.body_md} />
            {hint.question_back && <SafeMd text={hint.question_back} />}
          </article>
        ))}
        {solved && <p role="status">{t("solved_note", locale)}</p>}
        {canExplain && <p>{t("explanation_unlocked", locale)}</p>}
        {error && <p role="alert">{t(error, locale)}</p>}
      </div>
      <div className="flex flex-wrap gap-3">
        {ready && next !== null && (
          <button
            type="button"
            disabled={busy}
            className="rounded border p-2"
            onClick={() => act("hint")}
          >
            {t("hint", locale)} {next}
          </button>
        )}
        {(["stuck", "solved", "fixed_recheck"] as const).map((action) => (
          <button
            key={action}
            type="button"
            disabled={busy || (action === "solved" && solved)}
            className="rounded border p-2"
            onClick={() => (action === "fixed_recheck" ? setEditing(!editing) : act(action))}
          >
            {t(action === "fixed_recheck" && editing ? "cancel" : action, locale)}
          </button>
        ))}
      </div>
      {editing && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void act("recheck");
          }}
        >
          <label id="recheck-code-label">{t("updated_code", locale)}</label>
          <div dir="ltr" className="overflow-hidden rounded border">
            <CodeMirror
              value={code}
              onChange={setCode}
              extensions={extensions}
              height="240px"
              readOnly={busy}
              indentWithTab={false}
            />
          </div>
          <button type="submit" disabled={busy || !code.trim()} className="rounded border p-2">
            {t(busy ? "pending" : "recheck", locale)}
          </button>
        </form>
      )}
    </section>
  );
}
