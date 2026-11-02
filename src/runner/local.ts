import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accessSync, constants, existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { capOutput, mapStatus, RunnerError, type Runner, type RunLimits } from "./runner";

type Command = { command: string; args: string[] };
export function compileCommand(dir: string): Command {
  return {
    command: "timeout",
    args: [
      "20s",
      "prlimit",
      "--as=1073741824",
      "--cpu=20",
      "--",
      "g++",
      "-std=c++17",
      "-O2",
      "-pipe",
      "-o",
      join(dir, "a.out"),
      join(dir, "main.cpp"),
    ],
  };
}
export function nprocLimit(
  uid: number,
  proc = {
    pids: () => readdirSync("/proc"),
    status: (pid: string) => readFileSync(`/proc/${pid}/status`, "utf8"),
  },
): number {
  let pids: string[];
  try {
    pids = proc.pids();
  } catch {
    return 1024;
  }
  let threads = 0;
  for (const pid of pids) {
    if (!/^\d+$/.test(pid)) continue;
    try {
      const status = proc.status(pid);
      if (Number(status.match(/^Uid:\s+(\d+)/m)?.[1]) === uid)
        threads += Number(status.match(/^Threads:\s+(\d+)/m)?.[1] ?? 0);
    } catch {
      /* Processes can exit between directory enumeration and status reads. */
    }
  }
  // RLIMIT_NPROC counts all threads of the real uid, including those outside the sandbox.
  return Math.max(1024, threads + 256);
}
export function runCommand(dir: string, limits: RunLimits, lib64: boolean, nproc: number): Command {
  return {
    command: "prlimit",
    args: [
      `--as=${limits.memoryMb * 1048576}`,
      `--cpu=${Math.ceil(limits.timeMs / 1000) + 1}`,
      `--fsize=${limits.outputKb * 1024}`,
      `--nproc=${nproc}`,
      "--",
      "bwrap",
      "--ro-bind",
      "/usr",
      "/usr",
      "--ro-bind",
      "/lib",
      "/lib",
      ...(lib64 ? ["--ro-bind", "/lib64", "/lib64"] : []),
      "--ro-bind",
      join(dir, "a.out"),
      "/run/a.out",
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--tmpfs",
      "/tmp",
      "--unshare-all",
      "--die-with-parent",
      "--new-session",
      "/run/a.out",
    ],
  };
}
export function localAvailable(): boolean {
  try {
    for (const binary of ["g++", "bwrap", "timeout", "prlimit"])
      accessSync(`/usr/bin/${binary}`, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
let active = 0;
const waiting: (() => void)[] = [];
async function limited<T>(job: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  try {
    return await job();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
function execute(invocation: Command, input: string, wallMs: number, bytes: number) {
  return new Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    timedOut: boolean;
    overflow: boolean;
    timeMs: number;
  }>((resolve, reject) => {
    const start = performance.now();
    let timedOut = false,
      overflow = false,
      failure = false;
    const killTree = () => {
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          /* Already exited. */
        }
      }
    };
    // Arm before spawn's own timeout so SIGKILL can be classified as a wall timeout.
    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, wallMs);
    const child = spawn(invocation.command, invocation.args, {
      shell: false,
      detached: true,
      cwd: "/",
      env: { PATH: "/usr/bin:/bin", NODE_ENV: "production" },
      timeout: wallMs,
      killSignal: "SIGKILL",
      stdio: "pipe",
    });
    const output = { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    for (const stream of ["stdout", "stderr"] as const)
      child[stream].on("data", (chunk: Buffer) => {
        const space = bytes - output[stream].length;
        output[stream] = Buffer.concat([output[stream], chunk.subarray(0, space)]);
        if (chunk.length > space) {
          overflow = true;
          killTree();
        }
      });
    child.stdin.on("error", () => {}); // EPIPE after an early program exit is harmless.
    child.on("error", () => {
      failure = true;
    });
    child.on("exit", () => {
      killTree();
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      if (failure) {
        reject(new RunnerError("runner_down", "Runner could not start"));
        return;
      }
      resolve({
        stdout: capOutput(output.stdout.toString("utf8"), bytes),
        stderr: capOutput(output.stderr.toString("utf8"), bytes),
        exitCode,
        signal,
        timedOut,
        overflow,
        timeMs: Math.round(performance.now() - start),
      });
    });
    child.stdin.end(input);
  });
}
const limitsSchema = z.object({
  timeMs: z.number().int().min(1).max(2000),
  memoryMb: z.number().int().min(1).max(256),
  outputKb: z.number().int().min(1).max(64),
});
export function createLocalRunner(): Runner {
  if (!localAvailable()) throw new RunnerError("runner_down", "Runner dependencies are missing");
  const binaries = new Map<string, string>();
  return {
    name: "local",
    compile: (source, lang) =>
      limited(async () => {
        if (lang !== "cpp17" || Buffer.byteLength(source) > 65536)
          throw new RunnerError("invalid_source", "Invalid runner source");
        const dir = await mkdtemp(join(tmpdir(), "daleel-runner-"));
        let retained = false;
        try {
          await writeFile(join(dir, "main.cpp"), source);
          const result = await execute(compileCommand(dir), "", 20000, 8192);
          if (result.exitCode !== 0 || result.signal || result.timedOut || result.overflow)
            return { ok: false, output: capOutput(result.stderr || result.stdout, 8192, 30) };
          const binaryId = randomUUID();
          binaries.set(binaryId, dir);
          retained = true;
          return { ok: true, binaryId };
        } finally {
          if (!retained) await rm(dir, { recursive: true, force: true });
        }
      }),
    run: (binaryId, input, limits) =>
      limited(async () => {
        if (!limitsSchema.safeParse(limits).success || Buffer.byteLength(input) > 65536)
          throw new RunnerError("invalid_limits", "Invalid runner limits or input");
        const dir = binaries.get(binaryId);
        if (!dir) throw new RunnerError("invalid_binary", "Unknown runner binary");
        const result = await execute(
          runCommand(dir, limits, existsSync("/lib64"), nprocLimit(process.getuid?.() ?? 0)),
          input,
          limits.timeMs * 2,
          limits.outputKb * 1024,
        );
        if (result.stderr.startsWith("bwrap:"))
          throw new RunnerError("runner_down", "Runner sandbox could not start");
        return {
          status: mapStatus({ ...result, limitMs: limits.timeMs }),
          stdout: result.stdout,
          stderr: result.stderr,
          timeMs: result.timeMs,
          exitCode: result.exitCode,
        };
      }),
    dispose: async (binaryId) => {
      const dir = binaries.get(binaryId);
      if (dir) {
        binaries.delete(binaryId);
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}
