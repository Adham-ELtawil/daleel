"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { cpp } from "@codemirror/lang-cpp";
import type { Problem } from "@/src/db/repo/problems";
import { t as translate } from "@/src/i18n";
import { useLocale } from "@/src/components/locale-shell";
import { HttpError } from "@/src/services/http-error";
import { post, preloadProblem, startIdeaAttempt } from "@/src/services/intake-client";
import { Window } from "@/src/components/ui/window";
import { JudgeOutput } from "@/src/components/ui/judge-output";
import { LoadingSkeleton } from "@/src/components/attempt-feedback";
import { IdeaStartButton } from "@/src/components/idea-card";
import { MathText } from "@/src/components/math";

const extensions = [
  cpp(),
  EditorView.contentAttributes.of({ "aria-labelledby": "code-label", dir: "ltr" }),
];
const choices = [
  { key: "language", values: ["cpp17", "python3"] },
  { key: "verdictReported", values: ["NONE", "WA", "TLE", "MLE", "RE", "CE"] },
] as const;
export default function ProblemPage() {
  const locale = useLocale();
  const t = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const router = useRouter();
  const [problem, setProblem] = useState<Problem>();
  const [paste, setPaste] = useState(false);
  const [language, setLanguage] = useState("cpp17");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Parameters<typeof t>[0]>();
  useEffect(() => {
    const id = new URL(window.location.href).searchParams.get("problemId");
    if (!id) return;
    let active = true;
    setBusy(true);
    preloadProblem(id)
      .then((saved) => {
        if (active) setProblem(saved);
      })
      .catch((failure: unknown) => {
        if (active) setError(failure instanceof HttpError ? failure.code : "internal_error");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(
    event: FormEvent<HTMLFormElement> | null,
    mode: "resolve" | "attempt" | "idea",
  ) {
    event?.preventDefault();
    const form = event ? new FormData(event.currentTarget) : new FormData();
    setBusy(true);
    setError(undefined);
    try {
      if (mode === "idea" && problem) {
        await startIdeaAttempt(problem.id, (path) => router.push(path));
      } else if (mode === "resolve") {
        setProblem(undefined);
        const input = paste ? { statement: form.get("statement") } : { url: form.get("url") };
        setProblem((await post<{ problem: Problem }>("/api/problems/resolve", input)).problem);
      } else if (problem) {
        const { attemptId } = await post<{ attemptId: string }>("/api/attempts", {
          problemId: problem.id,
          code,
          language: form.get("language"),
          verdictReported: form.get("verdictReported"),
          verdictTestNo: form.get("verdictTestNo") ? Number(form.get("verdictTestNo")) : undefined,
          studentNote: form.get("studentNote"),
        });
        router.push(`/attempt/${attemptId}`);
      }
    } catch (failure) {
      const key = failure instanceof HttpError ? failure.code : "internal_error";
      setError(key);
      if (key === "fetch_failed") setPaste(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="intake ms-auto me-auto max-w-6xl space-y-6 ps-6 pe-6 py-10">
      <h1>{t("title")}</h1>
      {error && (
        <p
          role="alert"
          className={`state-panel ${error === "contest_running" ? "state-warning" : "state-error"}`}
        >
          {t(error)}
        </p>
      )}
      <div className="workspace-grid">
        <div className="min-w-0 space-y-6">
          <form onSubmit={(event) => submit(event, "resolve")}>
            <fieldset disabled={busy} className="grid gap-3">
              <label>
                {t("url")}
                <input
                  name="url"
                  dir="ltr"
                  className="bidi-isolate font-mono"
                  required={!paste}
                  onChange={() => {
                    setPaste(false);
                    setProblem(undefined);
                  }}
                />
              </label>
              {!paste && (
                <button
                  type="button"
                  className="text-button justify-self-start"
                  onClick={() => {
                    setPaste(true);
                    setProblem(undefined);
                  }}
                >
                  {t("statement")}
                </button>
              )}
              {paste && (
                <label>
                  {t("statement")}
                  <textarea name="statement" dir="ltr" required maxLength={20000} rows={8} />
                </label>
              )}
              <button
                type="submit"
                className={`button ${problem ? "button-secondary" : "button-primary"} justify-self-start`}
              >
                {t(busy ? "pending" : "resolve")}
              </button>
            </fieldset>
          </form>
          {problem && (
            <section className="space-y-4 border-t border-line pt-5">
              <h2 dir="ltr">{problem.title}</h2>
              <code dir="ltr" className="bidi-isolate text-sm text-muted">
                {t(problem.judge)} {problem.externalId}
              </code>
              <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
                {(["timeLimitMs", "memoryLimitMb", "rating"] as const)
                  .filter((key) => problem[key] !== null)
                  .map((key) => (
                    <div key={key} className="flex gap-2">
                      <dt>{t(key)}</dt>
                      <dd className="tabular-nums text-ink">{problem[key]}</dd>
                    </div>
                  ))}
              </dl>
              <ul aria-label={t("tags")} className="flex flex-wrap gap-2">
                {problem.tags.map((tag) => (
                  <li key={tag} className="badge badge-neutral">
                    <bdi dir="ltr">{tag}</bdi>
                  </li>
                ))}
              </ul>
              {problem.statementMd && (
                <details className="font-sans">
                  <summary className="cursor-pointer font-semibold">
                    {translate("title", locale, "statement")}
                  </summary>
                  <p dir="ltr" className="whitespace-pre-wrap pt-4">
                    <MathText text={problem.statementMd} />
                  </p>
                </details>
              )}
              {problem.samples.map((sample, index) => (
                <Window
                  key={index}
                  title={translate("sample", locale, "statement") + " " + (index + 1)}
                >
                  <JudgeOutput
                    rows={[
                      { label: t("input"), value: sample.input },
                      { label: t("output"), value: sample.output },
                    ]}
                  />
                </Window>
              ))}
            </section>
          )}
        </div>
        {problem ? (
          <form onSubmit={(event) => submit(event, "attempt")} className="min-w-0 space-y-4">
            <Window
              title={
                <bdi dir="ltr" className="font-mono">
                  {t(language === "cpp17" ? "main_cpp" : "main_py")}
                </bdi>
              }
            >
              <fieldset
                disabled={busy}
                className="editor-toolbar grid gap-3 border-b border-line p-3 text-sm"
              >
                {choices.map(({ key, values }) => (
                  <label key={key}>
                    {t(key)}
                    <select
                      name={key}
                      onChange={
                        key === "language" ? (event) => setLanguage(event.target.value) : undefined
                      }
                    >
                      {values.map((value) => (
                        <option key={value} value={value}>
                          {t(value)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <label>
                  {t("verdictTestNo")}
                  <input
                    name="verdictTestNo"
                    type="number"
                    step={1}
                    className="font-mono"
                    dir="ltr"
                  />
                </label>
              </fieldset>
              <label id="code-label" className="sr-only">
                {t("code")}
              </label>
              <CodeMirror
                theme="dark"
                value={code}
                onChange={setCode}
                extensions={language === "cpp17" ? extensions : extensions.slice(1)}
                height="360px"
                readOnly={busy}
                editable={!busy}
                indentWithTab={false}
              />
            </Window>
            <fieldset disabled={busy} className="grid gap-4">
              <label>
                {t("studentNote")}
                <textarea name="studentNote" maxLength={1000} rows={3} />
              </label>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <button type="submit" disabled={!code} className="button button-primary">
                    {t(busy ? "pending" : "submit")}
                  </button>
                  <IdeaStartButton
                    locale={locale}
                    busy={busy}
                    onClick={() => {
                      void submit(null, "idea");
                    }}
                  />
                </div>
                <p className="text-sm text-muted">{t("ideaHelper")}</p>
              </div>
            </fieldset>
          </form>
        ) : (
          <section role="status" className="state-panel state-empty lg:self-start">
            {busy ? <LoadingSkeleton label={t("pending")} /> : <p>{t("editor_empty")}</p>}
          </section>
        )}
      </div>
    </main>
  );
}
