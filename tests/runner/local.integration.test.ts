import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { Runner } from "@/src/runner/runner";

describe.skipIf(!process.env.RUNNER_INTEGRATION)("real local runner", () => {
  const limits = { timeMs: 200, memoryMb: 256, outputKb: 64 };
  async function withRunner(job: (runner: Runner, binaries: string[]) => Promise<void>) {
    const { createLocalRunner } = await import("@/src/runner/local");
    const runner = createLocalRunner();
    const binaries: string[] = [];
    try {
      await job(runner, binaries);
    } finally {
      for (const id of binaries) await runner.dispose(id);
    }
  }
  it(
    "compiles the AC/WA examples and compares actual outputs",
    () =>
      withRunner(async (runner, binaries) => {
        const { compareOutputs } = await import("@/src/runner/runner");
        for (const file of ["student", "fixed", "brute"]) {
          const compiled = await runner.compile(
            await readFile(`docs/examples/cf-4A-watermelon/${file}.cpp`, "utf8"),
            "cpp17",
          );
          expect(compiled.ok).toBe(true);
          if (!compiled.ok) throw new Error(compiled.output);
          binaries.push(compiled.binaryId);
          for (const input of ["2\n", "8\n"]) {
            const result = await runner.run(compiled.binaryId, input, limits);
            expect(result.status).toBe("ok");
            expect(
              compareOutputs(input === "2\n" ? "NO" : "YES", result.stdout, "exact_tokens"),
            ).toBe(file !== "student" || input !== "2\n");
          }
        }
      }),
    90000,
  );
  it(
    "reports CE",
    () =>
      withRunner(async (runner) => {
        expect(await runner.compile("int main( {", "cpp17")).toMatchObject({
          ok: false,
          output: expect.stringContaining("error:"),
        });
      }),
    30000,
  );
  it(
    "runs the CF 1A reference on 6 6 4 and returns 4",
    () =>
      withRunner(async (runner, binaries) => {
        const compiled = await runner.compile(
          await readFile("docs/examples/cf-1A-theatre-square/brute.cpp", "utf8"),
          "cpp17",
        );
        expect(compiled.ok).toBe(true);
        if (!compiled.ok) throw new Error(compiled.output);
        binaries.push(compiled.binaryId);
        expect(await runner.run(compiled.binaryId, "6 6 4\n", limits)).toMatchObject({
          status: "ok",
          stdout: "4\n",
        });
      }),
    30000,
  );
  it(
    "defines ONLINE_JUDGE so freopen guards keep output on stdout",
    () =>
      withRunner(async (runner, binaries) => {
        const compiled = await runner.compile(
          '#include <bits/stdc++.h>\nint main(){\n#ifndef ONLINE_JUDGE\nfreopen("output.txt","w",stdout);freopen("input.txt","r",stdin);\n#endif\nint a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}',
          "cpp17",
        );
        expect(compiled.ok).toBe(true);
        if (!compiled.ok) throw new Error(compiled.output);
        binaries.push(compiled.binaryId);
        expect(await runner.run(compiled.binaryId, "2 3\n", limits)).toMatchObject({
          status: "ok",
          stdout: "5\n",
        });
      }),
    30000,
  );
  it.each([
    ["int main(){for(;;){}}", "tle", ""],
    ['#include <iostream>\nint main(){for(;;)std::cout << "xxxxxxxxxxxxxxxx";}', "ole", ""],
    [
      '#include <sys/socket.h>\n#include <arpa/inet.h>\n#include <cstdio>\nint main(){int s=socket(AF_INET,SOCK_STREAM,0);sockaddr_in a{};a.sin_family=AF_INET;a.sin_port=htons(53);inet_pton(AF_INET,"1.1.1.1",&a.sin_addr);int r=connect(s,(sockaddr*)&a,sizeof(a));puts(r<0?"blocked":"connected");return r<0?0:1;}',
      "ok",
      "blocked\n",
    ],
  ])(
    "maps sandbox execution to %s",
    (source, status, stdout) =>
      withRunner(async (runner, binaries) => {
        const compiled = await runner.compile(source, "cpp17");
        expect(compiled.ok).toBe(true);
        if (!compiled.ok) throw new Error(compiled.output);
        binaries.push(compiled.binaryId);
        const result = await runner.run(compiled.binaryId, "", limits);
        expect(result.status).toBe(status);
        if (stdout) expect(result.stdout).toBe(stdout);
        expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(65536);
      }),
    30000,
  );
});
