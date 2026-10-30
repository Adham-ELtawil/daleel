import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Runner } from "@/src/runner/runner";

async function api() {
  const path = resolve("src/runner/runner.ts");
  expect(existsSync(path), "PR-15 runner contract and comparison are missing").toBe(true);
  return import("@/src/runner/runner");
}

describe("compareOutputs", () => {
  it.each([
    ["  YES\nNO  42", "yes no\t42\n", "exact_tokens", true],
    ["", " \n", "exact_tokens", true],
    ["Yes", "NO", "exact_tokens", false],
    ["Word", "word", "exact_tokens", false],
    ["1 2", "1", "exact_tokens", false],
    ["1", "1.0", "exact_tokens", false],
    ["0", "0.0000009", "float_1e6", true],
    ["0", "0.000002", "float_1e6", false],
    ["1000000", "1000000.9", "float_1e6", true],
    ["1000000", "1000002", "float_1e6", false],
    ["-1e6", "-1000000.5", "float_1e6", true],
    ["YES 2", "yes 2.0000001", "float_1e6", true],
    ["Infinity", "1e999", "float_1e6", false],
    ["NaN", "NaN", "float_1e6", false],
    ["0x10", "16", "float_1e6", false],
    ["same", "same", "any_valid", null],
    ["one", "two", "any_valid", null],
  ] as const)("%j vs %j (%s)", async (expected, actual, checker, match) => {
    expect((await api()).compareOutputs(expected, actual, checker)).toBe(match);
  });
});

describe("Runner contract using a fake execution boundary", () => {
  it.each([
    [0, null, "", false, false, "ok"],
    [null, "SIGXCPU", "", false, false, "tle"],
    [null, "SIGKILL", "", true, false, "tle"],
    [null, "SIGKILL", "", false, false, "mle"],
    [1, null, "std::bad_alloc", false, false, "mle"],
    [7, null, "failure", false, false, "re"],
    [null, "SIGSEGV", "", false, false, "re"],
    [0, null, "", false, true, "ole"],
    [null, "SIGKILL", "std::bad_alloc", false, true, "ole"],
  ] as const)(
    "maps exit %s / %s to %s",
    async (exitCode, signal, stderr, timedOut, overflow, status) => {
      const { mapStatus, capOutput } = await api();
      const fake: Runner = {
        name: "fake",
        compile: async () => ({ ok: true, binaryId: "fake-binary" }),
        run: async () => ({
          status: mapStatus({ exitCode, signal, stderr, timedOut, overflow }),
          stdout: capOutput("x".repeat(2000), 1024),
          stderr: capOutput(stderr, 1024),
          timeMs: 3,
          exitCode,
        }),
        dispose: async () => {},
      };
      const compiled = await fake.compile("source", "cpp17");
      expect(compiled).toEqual({ ok: true, binaryId: "fake-binary" });
      if (!compiled.ok) throw new Error("fake_compile_failed");
      const result = await fake.run(compiled.binaryId, "", {
        timeMs: 2000,
        memoryMb: 256,
        outputKb: 1,
      });
      expect(result).toMatchObject({ status, exitCode, timeMs: 3 });
      expect(Buffer.byteLength(result.stdout)).toBe(1024);
      await fake.dispose(compiled.binaryId);
    },
  );
  it("caps compiler diagnostics to 30 lines and 8 KiB, including UTF-8", async () => {
    const { capOutput } = await api();
    expect(
      capOutput(Array.from({ length: 40 }, (_, n) => `line${n}`).join("\n"), 8192, 30).split("\n"),
    ).toHaveLength(30);
    expect(Buffer.byteLength(capOutput("é".repeat(9000), 8191, 30))).toBeLessThanOrEqual(8191);
  });
  it("reports RunnerOff with a stable safe error shape", async () => {
    const path = resolve("src/runner/none.ts");
    expect(existsSync(path), "PR-15 none provider is missing").toBe(true);
    const { createNoneRunner } = await import("@/src/runner/none");
    const runner: Runner = createNoneRunner();
    for (const call of [
      () => runner.compile("source", "cpp17"),
      () => runner.run("missing", "", { timeMs: 1, memoryMb: 1, outputKb: 1 }),
    ])
      await expect(call()).rejects.toMatchObject({
        name: "RunnerOff",
        code: "runner_off",
        message: "Runner is off",
      });
    await runner.dispose("missing");
  });
});

describe("mapStatus with bwrap exit codes", () => {
  const base = { signal: null, stderr: "", timedOut: false, overflow: false };
  it("maps 137 after the time limit to tle and before it to mle", async () => {
    const { mapStatus } = await api();
    expect(mapStatus({ ...base, exitCode: 137, timeMs: 3000, limitMs: 2000 })).toBe("tle");
    expect(mapStatus({ ...base, exitCode: 137, timeMs: 10, limitMs: 2000 })).toBe("mle");
  });
  it("maps 152 to tle and 153 to ole", async () => {
    const { mapStatus } = await api();
    expect(mapStatus({ ...base, exitCode: 152 })).toBe("tle");
    expect(mapStatus({ ...base, exitCode: 153 })).toBe("ole");
  });
});
