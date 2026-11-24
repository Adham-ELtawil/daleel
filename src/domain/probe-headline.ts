import { t } from "@/src/i18n";
import type { RunVerdict } from "@/src/domain/run-verdict";

const hitKey = {
  tle: "sample_tle",
  mle: "sample_mle",
  re: "sample_re",
  ole: "sample_ole",
  wa: "sample_mismatch",
  compile: "sample_compile",
} as const;

export function probeHeadline(
  locale: "en" | "ar-EG",
  probe: { kind: "clear"; matched: boolean } | { kind: "hit"; status: RunVerdict | "compile" },
): string {
  if (probe.kind === "clear")
    return t(probe.matched ? "samples_passed" : "sample_mismatch", locale);
  return t(hitKey[probe.status], locale);
}

/** The finished diagnosis replaces a preview. An empty final sentence does not wipe the preview. */
export function headlineText(preview?: string, diagnosis?: string): string {
  return diagnosis && diagnosis.trim() ? diagnosis : (preview ?? "");
}
