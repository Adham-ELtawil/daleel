"use client";

import React, { useEffect, useMemo, useReducer } from "react";
import { codeLines } from "@/src/domain/code-lines";
import {
  initialWalkthroughState,
  walkthroughReducer,
  type WalkthroughState,
} from "@/src/domain/walkthrough-state";
import type { Explanation } from "@/src/llm/schemas/explanation";
import { localeAttrs, t } from "@/src/i18n";

export function Walkthrough({
  trace,
  code,
  locale,
  initialIndex = 0,
}: {
  trace: Explanation["trace"];
  code: string;
  locale: "en" | "ar-EG";
  initialIndex?: number;
}) {
  const lines = useMemo(() => {
    return codeLines(code);
  }, [code]);
  const direction = localeAttrs(locale).dir;
  const [state, dispatch] = useReducer(
    (state: WalkthroughState, action: Parameters<typeof walkthroughReducer>[1]) =>
      walkthroughReducer(state, action, trace.frames.length),
    initialWalkthroughState,
    (state) =>
      walkthroughReducer(state, { type: "scrub", index: initialIndex }, trace.frames.length),
  );
  useEffect(() => {
    if (!state.playing) return;
    const timer = setInterval(() => dispatch({ type: "step", delta: 1 }), 1000 / state.speed);
    return () => clearInterval(timer);
  }, [state.playing, state.speed]);
  const frame = trace.frames[state.index];
  const last = state.index === trace.frames.length - 1;
  function step(delta: -1 | 1) {
    dispatch({ type: "play", playing: false });
    dispatch({ type: "step", delta });
  }
  return (
    <section
      id="walkthrough"
      dir={direction}
      tabIndex={0}
      aria-label={t("title", locale, "walkthrough")}
      aria-keyshortcuts="ArrowLeft ArrowRight Space"
      className="space-y-3 rounded border p-4"
      onKeyDown={(event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest("button, input, select, textarea, a")
        )
          return;
        if (!["ArrowLeft", "ArrowRight", " "].includes(event.key)) return;
        event.preventDefault();
        if (event.key === " ") dispatch({ type: "play", playing: !state.playing });
        else step(event.key === "ArrowLeft" ? -1 : 1);
      }}
    >
      <h3 className="font-semibold">{t("title", locale, "walkthrough")}</h3>
      <p dir={direction} aria-live="polite">
        {frame.caption}
      </p>
      <pre dir="ltr" className="overflow-x-auto rounded bg-gray-50 p-2 text-sm">
        {lines.map((line, index) => (
          <code
            key={index}
            dir="ltr"
            data-code-line={index + 1}
            data-active={frame.code_line === index + 1}
            className={`bidi-isolate block ${frame.code_line === index + 1 ? "bg-amber-200 font-bold" : ""}`}
          >
            <span className="inline-block w-8 select-none text-gray-600" aria-hidden="true">
              {index + 1}
            </span>
            {line}
            {"\n"}
          </code>
        ))}
      </pre>
      {frame.arrays.map((array, index) => (
        <div key={index} dir="ltr" data-array={array.name} className="overflow-x-auto">
          <code dir="ltr" className="bidi-isolate">
            {array.name}
          </code>
          <div className="flex gap-1">
            {array.values.map((value, cell) => (
              <div
                key={cell}
                data-array-cell={cell}
                data-highlighted={array.highlight.includes(cell)}
                className="min-w-12 text-center"
              >
                <div
                  className={`border p-2 font-mono ${array.highlight.includes(cell) ? "bg-amber-200 font-bold" : ""}`}
                >
                  {value}
                </div>
                <div className="text-xs text-gray-600">{cell}</div>
                {array.pointers
                  .filter((pointer) => pointer.index === cell)
                  .map((pointer, index) => (
                    <code
                      key={index}
                      dir="ltr"
                      data-pointer={pointer.name}
                      className="bidi-isolate block font-bold"
                    >
                      {pointer.name}
                    </code>
                  ))}
              </div>
            ))}
          </div>
        </div>
      ))}
      {frame.vars.length > 0 && (
        <table className="w-full text-start">
          <caption>{t("variables", locale, "walkthrough")}</caption>
          <thead>
            <tr>
              {(["name", "value"] as const).map((key) => (
                <th key={key} className="text-start">
                  {t(key, locale, "walkthrough")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {frame.vars.map((variable, index) => (
              <tr key={index}>
                <td>
                  <code dir="ltr" className="bidi-isolate">
                    {variable.name}
                  </code>
                </td>
                <td>
                  <code dir="ltr" className="bidi-isolate">
                    {variable.changed ? (
                      <strong className="bg-amber-200">{variable.value}</strong>
                    ) : (
                      variable.value
                    )}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {last && (
        <div className="space-y-2">
          {(
            [
              ["input", trace.input],
              ["expected", trace.expected_output],
              ["actual", trace.student_output],
            ] as const
          ).map(([key, value]) => (
            <div key={key}>
              <h4>{t(key, locale, "stress")}</h4>
              <pre dir="ltr" className="overflow-x-auto bg-gray-50 p-2">
                {value}
              </pre>
            </div>
          ))}
        </div>
      )}
      <div dir="ltr" data-controls className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded border p-2"
          disabled={state.index === 0}
          onClick={() => step(-1)}
        >
          {t("previous", locale, "walkthrough")}
        </button>
        <button
          type="button"
          className="rounded border p-2"
          disabled={trace.frames.length === 1}
          onClick={() => dispatch({ type: "play", playing: !state.playing })}
        >
          {t(state.playing ? "pause" : "play", locale, "walkthrough")}
        </button>
        <button
          type="button"
          className="rounded border p-2"
          disabled={last}
          onClick={() => step(1)}
        >
          {t("next", locale, "walkthrough")}
        </button>
        <label>
          {t("speed", locale, "walkthrough")}{" "}
          <select
            aria-label={t("speed", locale, "walkthrough")}
            value={state.speed}
            onChange={(event) =>
              dispatch({
                type: "speed",
                value: Number(event.target.value) as WalkthroughState["speed"],
              })
            }
          >
            {(
              [
                [0.5, "slow"],
                [1, "normal"],
                [2, "fast"],
              ] as const
            ).map(([value, key]) => (
              <option key={value} value={value}>
                {t(key, locale, "walkthrough")}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("frame", locale, "walkthrough")}{" "}
          <input
            type="range"
            aria-label={t("frame", locale, "walkthrough")}
            min={0}
            max={trace.frames.length - 1}
            value={state.index}
            onChange={(event) => dispatch({ type: "scrub", index: Number(event.target.value) })}
          />
        </label>
        <bdi>
          {state.index + 1} / {trace.frames.length}
        </bdi>
      </div>
    </section>
  );
}
