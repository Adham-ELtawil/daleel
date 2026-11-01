"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/src/i18n";
import { SafeMd } from "./safe-md";

export async function openDemoCoach(refresh: () => void) {
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle: "coach_demo", role: "coach" }),
  });
  if (!response.ok) throw new Error("demo_coach_failed");
  refresh();
}
export function DemoCoach({ locale, available }: { locale: "en" | "ar-EG"; available: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function open() {
    setBusy(true);
    setError(false);
    try {
      await openDemoCoach(() => router.refresh());
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 border-t border-line pt-5">
      <button
        type="button"
        disabled={!available || busy}
        onClick={open}
        className="button button-secondary"
      >
        {busy ? t("pending", locale) : t("demo_entry", locale, "coach")}
      </button>
      {!available && <SafeMd text={t("demo_seed_hint", locale, "coach")} />}
      {error && (
        <p role="alert" className="state-panel state-error">
          {t("internal_error", locale)}
        </p>
      )}
    </div>
  );
}
