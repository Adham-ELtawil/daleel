"use client";

import { useState } from "react";
import { localeAttrs, t } from "@/src/i18n";

// The demo's original student.cpp, including the overflow on line 8.
const studentCode = `#include <bits/stdc++.h>
using namespace std;
int main() {
    int n, m, a;
    cin >> n >> m >> a;
    int x = (n + a - 1) / a;
    int y = (m + a - 1) / a;
    cout << x * y << endl;
    return 0;
}`;
const keyword = /^(int|return|using|namespace|#include)$/;
function syntax(line: string) {
  return line
    .split(/(\b(?:int|return|using|namespace)\b|\b\d+\b|#include)/g)
    .map((token, index) => {
      const color = /^\d+$/.test(token)
        ? "text-accent"
        : keyword.test(token)
          ? "text-[#a9b4ff]"
          : "";
      return (
        <span key={index} className={color}>
          {token}
        </span>
      );
    });
}
const outputs = ["1000000000 1000000000 1", "1000000000000000000", "-1486618624"];
export function VerdictHero({ locale }: { locale: "en" | "ar-EG" }) {
  const [replay, setReplay] = useState(0);
  return (
    <section
      key={replay}
      {...localeAttrs(locale)}
      aria-label={t("label", locale, "hero")}
      data-motion="verdict"
      className="verdict-hero min-w-0 overflow-hidden rounded-[10px] border border-line bg-surface"
    >
      <div className="flex flex-nowrap items-center gap-2 border-b border-line ps-3 pe-3 py-3 text-sm text-muted sm:gap-3 sm:ps-4 sm:pe-4">
        <bdi dir="ltr" className="shrink-0 whitespace-nowrap">
          {t("file", locale, "hero")}
        </bdi>
        <bdi dir="ltr" className="min-w-0 flex-1 truncate" title={t("problem", locale, "hero")}>
          {t("problem", locale, "hero")}
        </bdi>
        <button
          type="button"
          className="hero-replay ms-auto shrink-0 whitespace-nowrap text-accent transition-colors duration-150 hover:text-ink"
          onClick={() => setReplay((value) => value + 1)}
        >
          {t("replay", locale, "hero")}
        </button>
      </div>
      <pre dir="ltr" className="overflow-x-auto py-3 text-[13px] leading-6">
        {studentCode.split("\n").map((line, index) => (
          <span
            key={index}
            data-line={index + 1}
            className={`block border-s-[3px] ps-3 pe-4 ${index === 7 ? "hero-wrong-line" : "border-transparent"}`}
          >
            <span
              aria-hidden="true"
              className="me-4 inline-block w-4 select-none text-end text-muted"
            >
              {index + 1}
            </span>
            <code dir="ltr">{syntax(line)}</code>
          </span>
        ))}
      </pre>
      <div className="space-y-3 border-t border-line p-4 text-sm">
        <div className="relative">
          <p
            aria-hidden="true"
            className="hero-running animate-[hero-running_800ms_400ms] opacity-0 absolute inset-0 text-muted"
          >
            {t("running", locale, "hero")}
            <span className="hero-dots inline-block animate-[hero-wipe_800ms_steps(3)_400ms_both]">
              {" "}
              ···
            </span>
          </p>
          <p
            dir="ltr"
            className="hero-verdict bidi-isolate animate-[hero-reveal_200ms_1.2s_both] font-mono text-danger"
          >
            <span aria-hidden="true">✗ </span>
            {t("verdict", locale, "hero")}
          </p>
        </div>
        <dl className="hero-counterexample grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 overflow-hidden animate-[hero-open_250ms_1.9s_both]">
          {(["input", "expected", "got"] as const).map((field, index) => (
            <div key={field} className="contents">
              <dt className="font-sans text-start text-muted">{t(field, locale, "hero")}</dt>
              <dd
                dir="ltr"
                className={`hero-value bidi-isolate w-max min-w-0 max-w-full justify-self-start animate-[hero-wipe_400ms_both] font-mono text-[13px] ${field === "expected" ? "text-success" : field === "got" ? "text-danger" : "text-ink"}`}
                style={{
                  animationDelay: `${2 + index * 0.2}s`,
                  animationTimingFunction: `steps(${outputs[index].length})`,
                }}
              >
                <code dir="ltr">{outputs[index]}</code>
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="hero-hint animate-[hero-reveal_150ms_3s_both] space-y-2 border-s-[3px] border-s-accent border-t border-t-line bg-surface p-4">
        <p className="font-semibold text-accent">{t("hint_title", locale, "hero")}</p>
        <p className="hero-hint-text animate-[hero-wipe_900ms_3s_both] text-sm text-ink">
          {t("hint", locale, "hero")}
          <span
            aria-hidden="true"
            className="hero-caret text-accent opacity-0 animate-[hero-blink_400ms_steps(2)_3.3s_3]"
          >
            ▏
          </span>
        </p>
      </div>
    </section>
  );
}
