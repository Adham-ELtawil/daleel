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
import { IdeaStartButton } from "@/src/components/idea-card";

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
    <main className="intake ms-auto me-auto max-w-3xl space-y-6 ps-6 pe-6 py-10">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      {error && (
        <p role="alert" className="text-danger">
          {t(error)}
        </p>
      )}
      <form onSubmit={(event) => submit(event, "resolve")} className="card p-6">
        <fieldset disabled={busy} className="grid gap-3">
          <label>
            {t("url")}
            <input
              name="url"
              dir="ltr"
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
              className="button button-secondary justify-self-start"
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
          <button type="submit" className="button button-primary justify-self-start">
            {t(busy ? "pending" : "resolve")}
          </button>
        </fieldset>
      </form>
      {problem && (
        <>
          <section dir="ltr" className="card space-y-3 p-6">
            <h2 className="text-2xl font-semibold">{problem.title}</h2>
            <dl>
              {(["timeLimitMs", "memoryLimitMb"] as const).map((key) => (
                <div key={key}>
                  <dt>{t(key)}</dt>
                  <dd>{problem[key]}</dd>
                </div>
              ))}
            </dl>
            {problem.rating !== null && (
              <p>
                {t("rating")}: {problem.rating}
              </p>
            )}
            {problem.tags.length > 0 && (
              <p>
                {t("tags")}: {problem.tags.join(", ")}
              </p>
            )}
            {problem.samples.map((sample, index) => (
              <div key={index}>
                <h3>{t("input")}</h3>
                <pre dir="ltr">{sample.input}</pre>
                <h3>{t("output")}</h3>
                <pre dir="ltr">{sample.output}</pre>
              </div>
            ))}
          </section>
          <form onSubmit={(event) => submit(event, "attempt")} className="card grid gap-4 p-6">
            <label id="code-label">{t("code")}</label>
            <div dir="ltr" className="overflow-hidden rounded-lg border border-line">
              <CodeMirror
                value={code}
                onChange={setCode}
                extensions={extensions}
                height="240px"
                readOnly={busy}
                indentWithTab={false}
              />
            </div>
            <fieldset disabled={busy} className="grid gap-3">
              {choices.map(({ key, values }) => (
                <label key={key}>
                  {t(key)}
                  <select name={key}>
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
                <input name="verdictTestNo" type="number" step={1} />
              </label>
              <label>
                {t("studentNote")}
                <textarea name="studentNote" maxLength={1000} rows={3} />
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={!code}
                  className="button button-primary justify-self-start"
                >
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
            </fieldset>
          </form>
        </>
      )}
    </main>
  );
}
