"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/src/i18n";
import type { demoSession } from "@/src/services/demo-service";

type Example = Awaited<ReturnType<typeof demoSession>>["examples"][number];
export function DemoChoiceRow({
  example,
  locale,
  busy,
  onStart,
}: {
  example: Example;
  locale: "en" | "ar-EG";
  busy: boolean;
  onStart: (example: Example) => void;
}) {
  const problemCode =
    example.judge === "codeforces"
      ? t("demo_cf_code", locale, "landing").replace("{code}", example.externalId)
      : example.externalId;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onStart(example)}
      className="demo-row group flex w-full cursor-pointer items-center justify-between gap-4 border-s-2 border-transparent ps-4 pe-4 py-5 text-start transition-colors duration-150 focus-visible:border-accent hover:border-accent hover:bg-surface disabled:cursor-not-allowed"
    >
      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <bdi dir="ltr" className="w-full text-xl font-semibold sm:w-auto">
          {example.title}
        </bdi>{" "}
        <code dir="ltr" className="text-sm text-muted">
          {problemCode}
        </code>{" "}
        <bdi
          dir={example.locale === "en" ? "ltr" : "rtl"}
          className="inline-flex rounded-md border border-line ps-2 pe-2 py-0.5 font-sans text-sm text-muted"
        >
          {t(example.locale === "en" ? "english" : "arabic", locale)}
        </bdi>
      </span>{" "}
      <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-accent opacity-80 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
        {t("demo_start", locale, "landing")}
      </span>
    </button>
  );
}

export function DemoChoices({ locale }: { locale: "en" | "ar-EG" }) {
  const router = useRouter();
  const [examples, setExamples] = useState<Example[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/session/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("demo_failed");
        const data: { examples: Example[] } = await response.json();
        if (active) setExamples(data.examples);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);
  async function start(example: Example) {
    setBusy(true);
    setError(false);
    try {
      document.cookie = `daleel_locale=${example.locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
      const response = await fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId: example.problemId,
          language: "cpp17",
          code: example.code,
        }),
      });
      if (!response.ok) throw new Error("demo_failed");
      const { attemptId }: { attemptId: string } = await response.json();
      router.push(`/attempt/${attemptId}?autostart=1`);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="demo" className="space-y-5 scroll-mt-32" aria-labelledby="demo-heading">
      <h2 id="demo-heading" className="text-[25px] font-semibold">
        {t("try_demo", locale)}
      </h2>
      {!examples.length && !error && (
        <p role="status" className="text-muted">
          {t("pending", locale)}
        </p>
      )}
      <ul className="divide-y divide-line border-y border-line">
        {examples.map((example) => (
          <li key={example.problemId}>
            <DemoChoiceRow example={example} locale={locale} busy={busy} onStart={start} />
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-danger">
          {t("internal_error", locale)}
        </p>
      )}
    </section>
  );
}
