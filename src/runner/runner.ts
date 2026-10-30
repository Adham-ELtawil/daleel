export type RunLimits = { timeMs: number; memoryMb: number; outputKb: number };
export type CompileResult = { ok: true; binaryId: string } | { ok: false; output: string };
export type RunResult = {
  status: "ok" | "tle" | "mle" | "re" | "ole";
  stdout: string;
  stderr: string;
  timeMs: number;
  exitCode: number | null;
};
export interface Runner {
  name: string;
  compile(source: string, lang: "cpp17"): Promise<CompileResult>;
  run(binaryId: string, input: string, limits: RunLimits): Promise<RunResult>;
  dispose(binaryId: string): Promise<void>;
}
export class RunnerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RunnerError";
  }
}
export function capOutput(text: string, bytes: number, lines = Infinity): string {
  let capped = Buffer.from(text.split("\n").slice(0, lines).join("\n"))
    .subarray(0, bytes)
    .toString("utf8");
  while (Buffer.byteLength(capped) > bytes) capped = capped.slice(0, -1);
  return capped;
}
export function mapStatus(result: {
  exitCode: number | null;
  signal: string | null;
  stderr: string;
  timedOut: boolean;
  overflow: boolean;
  timeMs?: number;
  limitMs?: number;
}): RunResult["status"] {
  // bwrap reports a killed child as exit code 128 + signal (137 SIGKILL, 152 SIGXCPU, 153 SIGXFSZ).
  if (result.overflow || result.signal === "SIGXFSZ" || result.exitCode === 153) return "ole";
  if (result.timedOut || result.signal === "SIGXCPU" || result.exitCode === 152) return "tle";
  const killed = result.signal === "SIGKILL" || result.exitCode === 137;
  // RLIMIT_CPU soft == hard, so a CPU-limit kill is SIGKILL after at least the time limit.
  if (killed && result.limitMs !== undefined && (result.timeMs ?? 0) >= result.limitMs)
    return "tle";
  // Best effort: AS exhaustion can appear as SIGKILL or an uncaught allocation error.
  if (killed || result.stderr.includes("std::bad_alloc")) return "mle";
  return result.exitCode === 0 && !result.signal ? "ok" : "re";
}
export function compareOutputs(
  expected: string,
  actual: string,
  checker: "exact_tokens" | "float_1e6" | "any_valid",
): boolean | null {
  if (checker === "any_valid") return null;
  const tokens = (text: string) => (text.trim() ? text.trim().split(/\s+/) : []);
  const a = tokens(expected),
    b = tokens(actual);
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  return (
    a.length === b.length &&
    a.every((token, i) => {
      if (/^(yes|no)$/i.test(token)) return token.toLowerCase() === b[i].toLowerCase();
      if (checker === "exact_tokens") return token === b[i];
      if (numeric.test(token) && numeric.test(b[i])) {
        const x = Number(token),
          y = Number(b[i]);
        return (
          Number.isFinite(x) &&
          Number.isFinite(y) &&
          Math.abs(x - y) <= Math.max(1e-6, Math.abs(x) * 1e-6)
        );
      }
      return !/^(nan|[+-]?infinity)$/i.test(token) && token === b[i];
    })
  );
}
