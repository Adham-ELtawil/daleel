"use client";

import { useEffect, useRef, useState } from "react";
import type { Hint } from "@/src/domain/attempt-ui";
import { SafeMd } from "../safe-md";

export function HintRow({ hint, fresh = false }: { hint: Hint; fresh?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(!fresh);
  useEffect(() => {
    if (!fresh) return;
    const frame = requestAnimationFrame(() => {
      setOpen(true);
      ref.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [fresh]);
  return (
    <article ref={ref} data-hint-level={hint.level} tabIndex={-1} className="hint-row">
      <h3 dir="auto" className="text-lg text-accent">
        {hint.title}
      </h3>
      <div className="hint-expand" data-open={open}>
        <div className="min-h-0 overflow-hidden">
          <SafeMd text={hint.body_md} />
          {hint.question_back && <SafeMd text={hint.question_back} />}
        </div>
      </div>
    </article>
  );
}
