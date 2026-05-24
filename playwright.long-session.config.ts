import { defineConfig, devices } from '@playwright/test';

/**
 * Dedicated config that seeds a single very long mock session and boots
 * the API + web dev server on isolated ports so the existing playwright
 * suite (which seeds a different fixture set on 9787/5174) doesn't
 * collide.
 */
export default defineConfig({
  testDir: './tests/long-session',
  timeout: 60_000,
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:5184',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command:
        'rm -rf .tmp/playwright-long && PI_CRUST_PROJECT_ROOT=$PWD node scripts/seed-long-session.mjs && PI_CRUST_USE_MOCK=1 PI_CRUST_PROJECT_ROOT=$PWD PI_CRUST_SESSION_ROOT=$PWD/.tmp/playwright-long PI_CRUST_API_PORT=9797 npm run dev:api',
      url: 'http://127.0.0.1:9797/api/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command:
        'VITE_PI_CRUST_API_BASE=http://127.0.0.1:9797 npm run dev -- --host 127.0.0.1 --port 5184',
      url: 'http://127.0.0.1:5184/',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
