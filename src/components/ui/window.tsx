import React, { type ComponentProps, type ReactNode } from "react";

export function Window({
  title,
  filename,
  action,
  children,
  className = "",
  ...attrs
}: Omit<ComponentProps<"section">, "title"> & {
  title: ReactNode;
  filename?: string;
  action?: ReactNode;
}) {
  return (
    <section {...attrs} className={`editor-window ${className}`}>
      <div className="window-title flex items-center gap-3 border-b border-line ps-4 pe-4 py-3 text-sm text-muted">
        {filename && (
          <code dir="ltr" className="bidi-isolate shrink-0">
            {filename}
          </code>
        )}
        <div className="min-w-0 flex-1 truncate">{title}</div>
        {action && <div className="ms-auto shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
