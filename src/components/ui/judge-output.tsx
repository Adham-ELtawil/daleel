import React from "react";
export function JudgeOutput({
  rows,
  verdict,
  animate = false,
  hero = false,
}: {
  rows: { label: string; value: string; tone?: "expected" | "got" }[];
  verdict?: string;
  animate?: boolean;
  hero?: boolean;
}) {
  return (
    <div className="judge-output space-y-3 p-4 text-sm">
      {verdict && (
        <p
          dir="ltr"
          className={`bidi-isolate font-mono text-danger ${hero ? "hero-verdict animate-[hero-reveal_200ms_1.2s_both]" : animate ? "verdict-wipe" : ""}`}
        >
          <span aria-hidden="true">✗ </span>
          {verdict}
        </p>
      )}
      <dl
        className={`grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 ${hero ? "hero-counterexample overflow-hidden animate-[hero-open_250ms_1.9s_both]" : ""}`}
      >
        {rows.map(({ label, value, tone }, index) => (
          <div key={label} className="contents">
            <dt className="font-sans text-start text-muted">{label}</dt>
            <dd
              dir="ltr"
              className={`bidi-isolate min-w-0 max-w-full font-mono ${tone === "expected" ? "text-success" : tone === "got" ? "text-danger" : "text-ink"} ${hero ? "hero-value w-max justify-self-start animate-[hero-wipe_400ms_both]" : ""}`}
              style={
                hero
                  ? {
                      animationDelay: `${2 + index * 0.2}s`,
                      animationTimingFunction: `steps(${value.length})`,
                    }
                  : undefined
              }
            >
              {hero ? (
                <code dir="ltr" className="whitespace-pre">
                  {value}
                </code>
              ) : (
                <pre dir="ltr" className="overflow-x-auto whitespace-pre">
                  {value}
                </pre>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
