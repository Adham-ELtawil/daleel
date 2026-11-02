import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";
import { RunnerError } from "@/src/runner/runner";

vi.mock("node:fs", async (original) => ({
  ...(await original<typeof import("node:fs")>()),
  accessSync: vi.fn(),
}));
vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
function child() {
  const events = new EventEmitter();
  return Object.assign(events, {
    pid: 99999,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    finish(code: number | null = 0, signal: NodeJS.Signals | null = null) {
      events.emit("exit", code, signal);
      events.emit("close", code, signal);
    },
  });
}
async function setup() {
  expect(
    existsSync(resolve("src/runner/local.ts")),
    "PR-15 local process execution is missing",
  ).toBe(true);
  const { spawn } = await import("node:child_process");
  const children: ReturnType<typeof child>[] = [];
  vi.mocked(spawn).mockImplementation(() => {
    const proc = child();
    children.push(proc);
    return proc as unknown as ChildProcess;
  });
  const kill = vi.spyOn(process, "kill").mockReturnValue(true);
  const runner = (await import("@/src/runner/local")).createLocalRunner();
  const next = async (n: number) => vi.waitFor(() => expect(children).toHaveLength(n));
  return { runner, children, next, kill, spawn: vi.mocked(spawn) };
}
it("limits concurrency to two and disposes every compiled directory", async () => {
  const { runner, children, next } = await setup();
  const promises = Array.from({ length: 3 }, () => runner.compile("int main(){}", "cpp17"));
  await next(2);
  children[0].finish();
  await next(3);
  children[1].finish();
  children[2].finish();
  for (const result of await Promise.all(promises)) {
    expect(result.ok).toBe(true);
    if (result.ok) {
      await runner.dispose(result.binaryId);
      await expect(
        runner.run(result.binaryId, "", { timeMs: 1, memoryMb: 1, outputKb: 1 }),
      ).rejects.toMatchObject({ code: "invalid_binary" });
    }
  }
});
it("caps streamed output, kills the process tree, and isolates the subprocess environment", async () => {
  const { runner, children, next, kill, spawn } = await setup();
  vi.stubEnv("MODEL_API_KEY", "fake-secret");
  const compile = runner.compile("int main(){}", "cpp17");
  await next(1);
  children[0].finish();
  const compiled = await compile;
  if (!compiled.ok) throw new Error("fake_compile_failed");
  try {
    const pending = runner.run(compiled.binaryId, "input", {
      timeMs: 2000,
      memoryMb: 256,
      outputKb: 1,
    });
    await next(2);
    children[1].stdout.write("é".repeat(1000));
    children[1].stderr.write("x".repeat(2000));
    children[1].finish(null, "SIGKILL");
    const result = await pending;
    expect(result.status).toBe("ole");
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(1024);
    expect(Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(1024);
    expect(kill).toHaveBeenCalledWith(-99999, "SIGKILL");
    expect(spawn.mock.calls[1][2]).toMatchObject({
      detached: true,
      shell: false,
      timeout: 4000,
      killSignal: "SIGKILL",
      env: { PATH: "/usr/bin:/bin" },
    });
    expect(spawn.mock.calls[1][2]?.env).not.toHaveProperty("MODEL_API_KEY");
  } finally {
    await runner.dispose(compiled.binaryId);
  }
});
it("returns safe dependency errors for spawn failure and removes compiler artifacts", async () => {
  const { runner, children, next, spawn } = await setup();
  const pending = runner.compile("source", "cpp17");
  await next(1);
  children[0].emit("error", new Error("private spawn detail"));
  children[0].finish(1);
  await expect(pending).rejects.toMatchObject({
    code: "runner_down",
    message: "Runner could not start",
  });
  const args = spawn.mock.calls[0][1];
  expect(existsSync(String(args?.[args.length - 1]))).toBe(false);
});
it.each([
  "bwrap: Creating new namespace failed: Resource temporarily unavailable\n",
  "bwrap: execvp /run/a.out: Permission denied\n",
])("reports sandbox infrastructure failure as RunnerError: %s", async (stderr) => {
  const { runner, children, next } = await setup();
  const compile = runner.compile("int main(){}", "cpp17");
  await next(1);
  children[0].finish();
  const compiled = await compile;
  if (!compiled.ok) throw new Error("fake_compile_failed");
  try {
    const running = runner.run(compiled.binaryId, "", {
      timeMs: 2000,
      memoryMb: 256,
      outputKb: 64,
    });
    await next(2);
    children[1].stderr.write(stderr);
    children[1].finish(1);
    await expect(running).rejects.toBeInstanceOf(RunnerError);
    await expect(running).rejects.toMatchObject({
      code: "runner_down",
      message: "Runner sandbox could not start",
    });
  } finally {
    await runner.dispose(compiled.binaryId);
  }
});
it("keeps ordinary program stderr as a runtime error", async () => {
  const { runner, children, next } = await setup();
  const compile = runner.compile("int main(){}", "cpp17");
  await next(1);
  children[0].finish();
  const compiled = await compile;
  if (!compiled.ok) throw new Error("fake_compile_failed");
  try {
    const running = runner.run(compiled.binaryId, "", {
      timeMs: 2000,
      memoryMb: 256,
      outputKb: 64,
    });
    await next(2);
    children[1].stderr.write("program failed\n");
    children[1].finish(1);
    expect(await running).toMatchObject({ status: "re", stderr: "program failed\n" });
  } finally {
    await runner.dispose(compiled.binaryId);
  }
});
