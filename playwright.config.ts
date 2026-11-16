import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // The offline test needs the production build: playwright.pwa.config.ts (npm run test:pwa).
  testIgnore: 'pwa.spec.ts',
  // Playwright empties its output folder on every run; keep it apart from the evidence images in test-results/<name>/.
  outputDir: 'test-results/playwright',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: { baseURL: 'http://localhost:5199', trace: 'retain-on-failure' },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, browserName: 'chromium' } }],
  webServer: { command: 'npx vite --port 5199 --strictPort', url: 'http://localhost:5199', reuseExistingServer: true, timeout: 60_000 },
});
