"use client";

import React, { useEffect, useRef, useState } from "react";
import type { LlmCallInfo, LlmCallStep } from "@/src/db/repo/llm-calls";
import { t } from "@/src/i18n";

export function formatLatency(ms: number) {
  return ms < 1000 ? `${(ms / 1000).toFixed(2)}s` : `${(ms / 1000).toFixed(1)}s`;
}

/** Small provenance chip on every AI-produced result: which Meta model answered and how long it took. */
export function MetaBadge({
  attemptId,
  step,
  initial,
  locale,
  kind,
  watch,
}: {
  attemptId: string;
  step: LlmCallStep;
  initial?: LlmCallInfo;
  locale: "en" | "ar-EG";
  kind?: "translate";
  /** Refetch the latest call data when this value changes (after a new live result). */
  watch?: unknown;
}) {
  const [info, setInfo] = useState(initial);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (initial) return;
    }
    let cancelled = false;
    fetch(`/api/attempts/${attemptId}?locale=${locale}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { meta?: Partial<Record<LlmCallStep, LlmCallInfo>> } | null) => {
        if (!cancelled && data?.meta?.[step]) setInfo(data.meta[step]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch]);
  if (!info) return null;
  const label = t(
    info.replay ? "replay_label" : info.cached ? "cached_label" : "live_label",
    locale,
    "meta",
  );
  return (
    <span
      className="meta-badge"
      title={label}
      aria-label={`${label}: ${info.model}`}
      data-replay={info.replay ? "1" : undefined}
    >
      {kind === "translate" && (
        <span className="meta-badge-kind">{t("translated", locale, "meta")}</span>
      )}
      <span dir="ltr" className="bidi-isolate meta-badge-text">
        <span aria-hidden="true" className="meta-badge-dot" />
        Muse Spark · {info.model} ·{" "}
        {info.replay ? "replay" : info.cached ? "cached" : formatLatency(info.latencyMs)}
      </span>
    </span>
  );
}
