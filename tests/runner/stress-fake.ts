import { vi } from "vitest";
import type { Runner } from "@/src/runner/runner";
import plan from "@/tests/fixtures/llm/stress-a.json";

export function fakeStressRunner() {
  return {
    name: "fake",
    compile: vi.fn<Runner["compile"]>(async (source) => ({
      ok: true,
      binaryId: source === plan.brute_cpp ? "brute" : "student",
    })),
    run: vi.fn<Runner["run"]>(async (binary, input) => ({
      status: "ok",
      stdout:
        Number(input) % 2 === 0 && (binary === "student" || Number(input) > 2) ? "YES\n" : "NO\n",
      stderr: "",
      timeMs: 1,
      exitCode: 0,
    })),
    dispose: vi.fn<Runner["dispose"]>(async () => {}),
  };
}
