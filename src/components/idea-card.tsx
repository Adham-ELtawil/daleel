"use client";

import Link from "next/link";
import type { attemptDetail } from "@/src/services/attempt-service";
import { localeAttrs, t } from "@/src/i18n";
import { StatementPanel } from "./statement-panel";
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
    <section {...localeAttrs(locale)} className="workspace-grid">
      {detail.problem && (
        <div className="min-w-0 lg:sticky lg:top-28 lg:self-start">
          <h2 dir="ltr" className="mb-4">
            {detail.problem.title}
          </h2>
          <StatementPanel problem={detail.problem} locale={locale} open />
        </div>
      )}
      <div className="space-y-5">
        <HintLadder detail={detail} locale={locale} ready />
        <Link
          className="button button-secondary"
          href={`/problem?problemId=${encodeURIComponent(detail.attempt.problemId)}`}
        >
          {t("ideaPasteCode", locale)}
        </Link>
      </div>
    </section>
  );
}
