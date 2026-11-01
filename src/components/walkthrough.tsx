"use client";

import React, { useEffect, useMemo, useReducer } from "react";
import { codeLines } from "@/src/domain/code-lines";
import {
  initialWalkthroughState,
  walkthroughReducer,
  type WalkthroughState,
} from "@/src/domain/walkthrough-state";
import type { Explanation } from "@/src/llm/schemas/explanation";
import { Window } from "./ui/window";
import { JudgeOutput } from "./ui/judge-output";
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
      className="space-y-4 border-t border-line pt-5"
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
      <Window title={t("code", locale)}>
        <pre dir="ltr" className="walkthrough-code overflow-x-auto py-3 text-sm">
          {lines.map((line, index) => (
            <code
              key={index}
              dir="ltr"
              data-code-line={index + 1}
              data-active={frame.code_line === index + 1}
              className={`bidi-isolate block border-s-[3px] ps-3 pe-3 ${frame.code_line === index + 1 ? "diagnosis-suspect font-bold text-ink" : "border-transparent"}`}
            >
              <span
                className="inline-block w-8 select-none bg-surface text-muted"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              {line}
              {"\n"}
            </code>
          ))}
        </pre>
      </Window>
      {frame.arrays.map((array, index) => (
        <div key={index} dir="ltr" data-array={array.name} className="overflow-x-auto">
          <code dir="ltr" className="bidi-isolate">
            {array.name}
          </code>
          <div className="mt-2 flex gap-2">
            {array.values.map((value, cell) => (
              <div
                key={cell}
                data-array-cell={cell}
                data-highlighted={array.highlight.includes(cell)}
                className="bidi-isolate min-w-12 shrink-0 text-center font-mono"
              >
                <div
                  className={`rounded-lg border border-line p-3 font-mono ${array.highlight.includes(cell) ? "bg-accent-soft font-bold text-ink" : "bg-surface"}`}
                >
                  {value}
                </div>
                <div className="text-xs text-muted">{cell}</div>
                {array.pointers
                  .filter((pointer) => pointer.index === cell)
                  .map((pointer, index) => (
                    <code
                      key={index}
                      dir="ltr"
                      data-pointer={pointer.name}
                      className="bidi-isolate block font-bold text-accent"
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
        <table className="w-auto text-start text-sm">
          <caption className="pb-1 text-start text-muted">
            {t("variables", locale, "walkthrough")}
          </caption>
          <thead>
            <tr>
              {(["name", "value"] as const).map((key) => (
                <th key={key} className="pe-6 text-start font-semibold">
                  {t(key, locale, "walkthrough")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {frame.vars.map((variable, index) => (
              <tr key={index}>
                <td className="pe-6 py-0.5">
                  <bdi dir="ltr" className="font-sans">
                    {variable.name}
                  </bdi>
                </td>
                <td>
                  <code dir="ltr" className="bidi-isolate font-mono">
                    {variable.changed ? (
                      <strong className="rounded bg-accent-soft ps-2 pe-2 text-ink">
                        {variable.value}
                      </strong>
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
        <Window title={t("counterexample", locale, "attemptFlow")}>
          <JudgeOutput
            rows={[
              { label: t("input", locale, "stress"), value: trace.input },
              {
                label: t("expected", locale, "stress"),
                value: trace.expected_output,
                tone: "expected",
              },
              { label: t("actual", locale, "stress"), value: trace.student_output, tone: "got" },
            ]}
          />
        </Window>
      )}
      <div dir="ltr" data-controls className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="button button-secondary"
          disabled={state.index === 0}
          onClick={() => step(-1)}
        >
          <span aria-hidden="true">◀</span>
          {t("previous", locale, "walkthrough")}
        </button>
        <button
          type="button"
          className="button button-secondary"
          disabled={trace.frames.length === 1}
          onClick={() => dispatch({ type: "play", playing: !state.playing })}
        >
          <span aria-hidden="true">{state.playing ? "Ⅱ" : "▶"}</span>
          {t(state.playing ? "pause" : "play", locale, "walkthrough")}
        </button>
        <button
          type="button"
          className="button button-secondary"
          disabled={last}
          onClick={() => step(1)}
        >
          {t("next", locale, "walkthrough")}
          <span aria-hidden="true">▶</span>
        </button>
        <label>
          {t("speed", locale, "walkthrough")}{" "}
          <select
            className="rounded-lg border border-line bg-surface p-2"
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
            className="align-middle accent-accent"
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
