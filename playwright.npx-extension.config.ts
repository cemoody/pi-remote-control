import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/playwright-npx",
  timeout: 180_000,
  fullyParallel: false,
  use: {
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
