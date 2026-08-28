// Playwright config for the CityFlow auction-fix E2E verification.
// Run AFTER the fix is deployed:
//   BASE_URL=https://cityflow.sizops.co.il npx playwright test --config playwright.config.js
// (BASE_URL defaults to the production site.) The spec registers throwaway
// bidders and verifies the two production bugs are gone in a real browser.
import { defineConfig } from 'playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://cityflow.sizops.co.il';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});