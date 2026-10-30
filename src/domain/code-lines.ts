/** A final newline terminates the last source line; it does not add an empty line. */
export function codeLines(code: string): string[] {
  return code.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
}
