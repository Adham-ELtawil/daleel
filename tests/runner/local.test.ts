import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";

vi.mock("node:fs", async (original) => ({
  ...(await original<typeof import("node:fs")>()),
  accessSync: vi.fn(),
}));

async function local() {
  expect(existsSync(resolve("src/runner/local.ts")), "PR-15 sandbox argv builder is missing").toBe(
    true,
  );
  return import("@/src/runner/local");
}
it("builds compile argv with timeout, AS/CPU limits and C++17", async () => {
  expect((await local()).compileCommand("/tmp/test dir;$(touch nope)")).toEqual({
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
      "/tmp/test dir;$(touch nope)/a.out",
      "/tmp/test dir;$(touch nope)/main.cpp",
    ],
  });
});
it.each([false, true])(
  "builds isolated run argv with lib64=%s, without shell interpolation",
  async (lib64) => {
    const dir = "/tmp/test dir;$(touch nope)";
    const invocation = (await local()).runCommand(
      dir,
      { timeMs: 1500, memoryMb: 256, outputKb: 64 },
      lib64,
    );
    expect(invocation.command).toBe("prlimit");
    expect(invocation.args).toEqual([
      "--as=268435456",
      "--cpu=3",
      "--fsize=65536",
      "--nproc=1024",
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
      `${dir}/a.out`,
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
    ]);
    expect(invocation.args).not.toContain("sh");
    expect(invocation.args).not.toContain("-c");
  },
);
it("rejects missing binary ids and limits outside the product caps", async () => {
  const runner = (await local()).createLocalRunner();
  await expect(
    runner.run("../../etc/passwd", "", { timeMs: 2000, memoryMb: 256, outputKb: 64 }),
  ).rejects.toMatchObject({ code: "invalid_binary" });
  for (const limits of [
    { timeMs: 2001, memoryMb: 256, outputKb: 64 },
    { timeMs: 1, memoryMb: 257, outputKb: 64 },
    { timeMs: 1, memoryMb: 256, outputKb: 65 },
  ])
    await expect(runner.run("missing", "", limits)).rejects.toMatchObject({
      code: "invalid_limits",
    });
});
