import { defineConfig, devices } from '@playwright/test';

/**
 * PWA checks (M10) run against the production build, because the service worker exists only there.
 * `npm run test:pwa` builds, serves with `vite preview` and runs e2e/pwa.spec.ts.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'pwa.spec.ts',
  outputDir: 'test-results/playwright-pwa',
  timeout: 240_000,
  expect: { timeout: 30_000 },
  use: { baseURL: 'http://localhost:5198', trace: 'retain-on-failure', serviceWorkers: 'allow' },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, browserName: 'chromium' } }],
  webServer: {
    command: 'npm run build && npx vite preview --port 5198 --strictPort',
    url: 'http://localhost:5198',
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
