"use client";

import { t } from "@/src/i18n";

export function PrintReport({ locale }: { locale: "en" | "ar-EG" }) {
  return (
    <button type="button" className="rounded border p-2" onClick={() => window.print()}>
      {t("print", locale, "report")}
    </button>
  );
}
