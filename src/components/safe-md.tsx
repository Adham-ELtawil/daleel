import React from "react";

export function SafeMd({ text }: { text: string }) {
  return text
    .split(/\n\s*\n/)
    .filter((part) => part.trim())
    .map((paragraph, index) => (
      <p key={index} dir="auto">
        {paragraph.split(/(`[^`\n]+`)/g).map((part, token) =>
          part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
            <code key={token} dir="ltr" className="bidi-isolate">
              {part.slice(1, -1)}
            </code>
          ) : (
            part
          ),
        )}
      </p>
    ));
}
