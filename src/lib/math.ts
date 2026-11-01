type MathPart = { kind: "text"; value: string } | { kind: "math"; value: string; display: boolean };

const delimiters = ["$$$$$$", "$$$", "$$", "$"];

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  while (text[--index] === "\\") backslashes++;
  return backslashes % 2 === 1;
}

export function splitMath(text: string): MathPart[] {
  const parts: MathPart[] = [];
  let plain = "";
  const flush = () => {
    if (plain) parts.push({ kind: "text", value: plain });
    plain = "";
  };
  for (let cursor = 0; cursor < text.length;) {
    if (text[cursor] === "\\" && ["$", "\\"].includes(text[cursor + 1])) {
      plain += text[cursor + 1] === "$" ? "$" : "\\\\";
      cursor += 2;
      continue;
    }
    if (text[cursor] !== "$") {
      plain += text[cursor++];
      continue;
    }
    const delimiter = delimiters.find((value) => text.startsWith(value, cursor))!;
    const start = cursor + delimiter.length;
    const single = delimiter === "$";
    let end = text.indexOf(delimiter, start);
    while (end !== -1 && isEscaped(text, end)) end = text.indexOf(delimiter, end + 1);
    const value = end === -1 ? "" : text.slice(start, end);
    if (
      value &&
      (!single ||
        (!/\s/.test(value[0]) &&
          !/\s/.test(value[value.length - 1]) &&
          !/\d/.test(text[end + 1] ?? "") &&
          !/\n\s*\n/.test(value)))
    ) {
      flush();
      parts.push({
        kind: "math",
        value,
        display: delimiter.length === 2 || delimiter.length === 6,
      });
      cursor = end + delimiter.length;
    } else {
      plain += delimiter;
      cursor = start;
    }
  }
  flush();
  return parts;
}
