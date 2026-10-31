"use client";

import { t } from "@/src/i18n";

export function PrintReport({ locale }: { locale: "en" | "ar-EG" }) {
  return (
    <button type="button" className="button button-secondary" onClick={() => window.print()}>
      {t("print", locale, "report")}
    </button>
  );
}
