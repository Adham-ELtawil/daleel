import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import type { Runner } from "@/src/runner/runner";

it.each([false, true])(
  "smoke exits successfully only if every sandbox expectation holds, broken=%s",
  async (broken) => {
    expect(existsSync(resolve("scripts/smoke-runner.ts")), "PR-15 smoke script is missing").toBe(
      true,
    );
    const { runSmokeRunner } = await import("@/scripts/smoke-runner");
    const sources = new Map<string, string>();
    let count = 0;
    const disposed: string[] = [];
    const runner: Runner = {
      name: "fake",
      compile: async (source) => {
        const id = String(count++);
        sources.set(id, source);
        return { ok: true, binaryId: id };
      },
      run: async (id, input) => {
        const source = sources.get(id)!;
        const status = source.includes("for (;;)")
          ? "tle"
          : source.includes("2147483648")
            ? "mle"
            : "ok";
        const stdout = source.includes("socket")
          ? broken
            ? "connected"
            : "blocked"
          : input === "8\n" || source.includes("if (w % 2 == 0)")
            ? "YES"
            : "NO";
        return { status, stdout, stderr: "", timeMs: 1, exitCode: status === "ok" ? 0 : null };
      },
      dispose: async (id) => {
        disposed.push(id);
      },
    };
    expect(await runSmokeRunner({}, { runner, print: () => {} })).toBe(broken ? 1 : 0);
    expect(disposed).toHaveLength(count);
  },
);
