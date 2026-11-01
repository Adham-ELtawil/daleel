"use client";

import { useState } from "react";
import { Window } from "./ui/window";
import { JudgeOutput } from "./ui/judge-output";
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
    <Window
      key={replay}
      {...localeAttrs(locale)}
      aria-label={t("label", locale, "hero")}
      data-motion="verdict"
      className="verdict-hero"
      filename={t("file", locale, "hero")}
      title={
        <bdi dir="ltr" title={t("problem", locale, "hero")}>
          {t("problem", locale, "hero")}
        </bdi>
      }
      action={
        <button
          type="button"
          className="hero-replay whitespace-nowrap text-accent transition-colors duration-150 hover:text-ink"
          onClick={() => setReplay((value) => value + 1)}
        >
          {t("replay", locale, "hero")}
        </button>
      }
    >
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
      <div className="relative border-t border-line">
        <p
          aria-hidden="true"
          className="hero-running absolute inset-0 p-4 text-sm text-muted opacity-0 animate-[hero-running_800ms_400ms]"
        >
          {t("running", locale, "hero")}
          <span className="hero-dots inline-block animate-[hero-wipe_800ms_steps(3)_400ms_both]">
            {" "}
            ···
          </span>
        </p>
        <JudgeOutput
          hero
          verdict={t("verdict", locale, "hero")}
          rows={(["input", "expected", "got"] as const).map((field, index) => ({
            label: t(field, locale, "hero"),
            value: outputs[index],
            tone: field === "input" ? undefined : field,
          }))}
        />
      </div>
      <div className="hero-hint hint-row animate-[hero-reveal_150ms_3s_both] border-t border-t-line">
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
    </Window>
  );
}
