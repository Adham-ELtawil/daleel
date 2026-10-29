import { defineConfig, devices } from "@playwright/test";

// Run with `pnpm test:e2e` after `pnpm exec playwright install chromium`.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3108",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command:
          "node --import tsx tests/e2e/setup.ts && pnpm dev --hostname 127.0.0.1 --port 3108",
        env: {
          DATABASE_URL: "file:./data/e2e.db",
          DATABASE_AUTH_TOKEN: "",
          CF_API_BASE_URL: "http://127.0.0.1:1",
          NEXT_TELEMETRY_DISABLED: "1",
        },
        url: "http://127.0.0.1:3108/api/health",
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
