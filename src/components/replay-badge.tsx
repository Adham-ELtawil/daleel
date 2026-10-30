import React from "react";
import { t } from "@/src/i18n";

export function ReplayBadge({
  replay,
  recordedAt,
  locale,
}: {
  replay: boolean;
  recordedAt: string | null;
  locale: "en" | "ar-EG";
}) {
  return replay && recordedAt ? (
    <span dir="auto" className="rounded border ps-2 pe-2 py-1 text-xs">
      {t("replay_badge", locale).replace("{date}", recordedAt.slice(0, 10))}
    </span>
  ) : null;
}
