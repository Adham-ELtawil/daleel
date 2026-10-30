import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createRunner } from "@/src/runner/factory";
import { compareOutputs, type Runner } from "@/src/runner/runner";

export async function runSmokeRunner(
  env: Record<string, string | undefined>,
  deps: { runner?: Runner; print?: (line: string) => void } = {},
): Promise<number> {
  const print = deps.print ?? console.log;
  const limits = { timeMs: 2000, memoryMb: 256, outputKb: 64 };
  try {
    const runner = deps.runner ?? createRunner(env);
    if (runner.name === "none") {
      print("smoke:runner off; set RUNNER_PROVIDER=local (see .env.example)");
      return 2;
    }
    let passed = true;
    for (const file of ["student", "fixed", "brute", "network", "loop", "memory"]) {
      const path = ["student", "fixed", "brute"].includes(file)
        ? `docs/examples/cf-4A-watermelon/${file}.cpp`
        : `tests/fixtures/runner/${file}.cpp`;
      const compiled = await runner.compile(await readFile(path, "utf8"), "cpp17");
      if (!compiled.ok) {
        print(`${file}: CE ${compiled.output}`);
        passed = false;
        continue;
      }
      try {
        for (const input of ["student", "fixed", "brute"].includes(file) ? ["2\n", "8\n"] : [""]) {
          const result = await runner.run(compiled.binaryId, input, limits);
          print(
            `${file} input=${JSON.stringify(input)} status=${result.status} stdout=${JSON.stringify(result.stdout)} stderr=${JSON.stringify(result.stderr)} timeMs=${result.timeMs}`,
          );
          const expected =
            file === "network" ? "blocked" : file === "student" || input === "8\n" ? "YES" : "NO";
          passed =
            (file === "loop"
              ? result.status === "tle"
              : file === "memory"
                ? ["mle", "re"].includes(result.status)
                : result.status === "ok" &&
                  compareOutputs(expected, result.stdout, "exact_tokens") === true) && passed;
        }
      } finally {
        await runner.dispose(compiled.binaryId);
      }
    }
    return passed ? 0 : 1;
  } catch {
    print("smoke:runner failed; check g++, bubblewrap and namespace permissions");
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  runSmokeRunner(process.env).then((code) => {
    process.exitCode = code;
  });
}
