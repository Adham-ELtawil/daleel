import React from "react";
import { t } from "@/src/i18n";

export function StatusChip({
  status,
  locale,
}: {
  status: "new" | "diagnosing" | "diagnosed" | "error" | "solved" | "stuck";
  locale: "en" | "ar-EG";
}) {
  const tone =
    status === "solved"
      ? "success"
      : status === "error"
        ? "danger"
        : status === "stuck"
          ? "warning"
          : "neutral";
  return <span className={`badge badge-${tone}`}>{t(`status_${status}`, locale)}</span>;
}
