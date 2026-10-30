"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/src/i18n";
import type { demoSession } from "@/src/services/demo-service";

type Example = Awaited<ReturnType<typeof demoSession>>["examples"][number];
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
    <section className="space-y-3" aria-labelledby="demo-heading">
      <h2 id="demo-heading" className="text-2xl font-semibold">
        {t("try_demo", locale)}
      </h2>
      {!examples.length && !error && <p role="status">{t("pending", locale)}</p>}
      <ul className="flex flex-wrap gap-3">
        {examples.map((example) => (
          <li key={example.problemId}>
            <button
              type="button"
              disabled={busy}
              onClick={() => start(example)}
              className="rounded border p-3"
            >
              <bdi dir="ltr">{example.title}</bdi>{" "}
              <span className="text-sm">
                {t(example.locale === "en" ? "english" : "arabic", locale)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert">{t("internal_error", locale)}</p>}
    </section>
  );
}
