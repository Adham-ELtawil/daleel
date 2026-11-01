"use client";

import Link from "next/link";
import type { attemptDetail } from "@/src/services/attempt-service";
import { localeAttrs, t } from "@/src/i18n";
import { HintLadder } from "./hint-ladder";

export function IdeaStartButton({
  locale,
  busy,
  onClick,
}: {
  locale: "en" | "ar-EG";
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" disabled={busy} className="button button-secondary" onClick={onClick}>
      {t("ideaStart", locale)}
    </button>
  );
}
export function IdeaCard({
  detail,
  locale,
}: {
  detail: Awaited<ReturnType<typeof attemptDetail>>;
  locale: "en" | "ar-EG";
}) {
  return (
    <section {...localeAttrs(locale)} className="space-y-4">
      <HintLadder detail={detail} locale={locale} ready />
      <Link
        className="button button-secondary"
        href={`/problem?problemId=${encodeURIComponent(detail.attempt.problemId)}`}
      >
        {t("ideaPasteCode", locale)}
      </Link>
    </section>
  );
}
