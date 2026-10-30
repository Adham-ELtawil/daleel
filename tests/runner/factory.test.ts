import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";

vi.mock("node:fs", async (original) => ({
  ...(await original<typeof import("node:fs")>()),
  accessSync: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("defaults to none and rejects retired or invalid providers", async () => {
  expect(existsSync(resolve("src/runner/factory.ts")), "PR-15 factory is missing").toBe(true);
  const { createRunner } = await import("@/src/runner/factory");
  expect(createRunner({}).name).toBe("none");
  expect(createRunner({ RUNNER_PROVIDER: "local" }).name).toBe("local");
  for (const provider of ["docker", "judge0", "invalid"])
    expect(() => createRunner({ RUNNER_PROVIDER: provider })).toThrow();
});
it.each([true, false])(
  "health reports local binaries available=%s without network or execution",
  async (available) => {
    const { accessSync } = await import("node:fs");
    vi.mocked(accessSync).mockImplementation(() => {
      if (!available) throw new Error("ENOENT");
    });
    vi.stubEnv("RUNNER_PROVIDER", "local");
    expect(await GET().json()).toMatchObject({ runner: available ? "ok" : "down" });
    if (!available) {
      const { createRunner } = await import("@/src/runner/factory");
      expect(() => createRunner({ RUNNER_PROVIDER: "local" })).toThrow(
        "Runner dependencies are missing",
      );
    }
  },
);
