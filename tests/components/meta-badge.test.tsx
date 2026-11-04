import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MetaBadge, formatLatency } from "@/src/components/meta-badge";

const render = (
  info: { model: string; latencyMs: number; replay: boolean } | undefined,
  locale: "en" | "ar-EG",
  kind?: "translate",
) =>
  renderToStaticMarkup(
    createElement(MetaBadge, { attemptId: "A1", step: "diagnose", initial: info, locale, kind }),
  );

describe("MetaBadge (visible Meta Muse Spark provenance)", () => {
  it("shows model and latency for a live call", () => {
    const html = render({ model: "muse-spark-1.3", latencyMs: 12_420, replay: false }, "en");
    expect(html).toContain("Muse Spark");
    expect(html).toContain("muse-spark-1.3");
    expect(html).toContain("12.4s");
    expect(html).toContain('dir="ltr"');
    expect(html).toContain("Generated live by Meta Muse Spark");
  });
  it("marks replayed recordings instead of a latency", () => {
    const en = render({ model: "muse-spark-1.3", latencyMs: 3, replay: true }, "en");
    expect(en).toContain("replay");
    expect(en).not.toContain("0.0s");
    const ar = render({ model: "muse-spark-1.3", latencyMs: 3, replay: true }, "ar-EG");
    expect(ar).toContain("رد مسجّل من Meta Muse Spark");
  });
  it("labels translation calls in the viewer language", () => {
    expect(render({ model: "m", latencyMs: 4100, replay: false }, "en", "translate")).toContain(
      "Translated",
    );
    expect(render({ model: "m", latencyMs: 4100, replay: false }, "ar-EG", "translate")).toContain(
      "مترجَم",
    );
  });
  it("renders nothing without call data", () => {
    expect(render(undefined, "en")).toBe("");
  });
  it("formats latency", () => {
    expect(formatLatency(980)).toBe("0.98s");
    expect(formatLatency(63_012)).toBe("63.0s");
  });
});
