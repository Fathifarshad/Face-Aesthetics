import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { newCaseWithFrontal, setupVault, watchNetwork } from './helpers';

/**
 * M10 PWA (docs/PRD.md §13): after one visit the app works with no network — it loads, the face model and WASM
 * come from the cache, a photo is analysed and the simulation renders. Runs on the production build
 * (playwright.pwa.config.ts). Synthetic data; the photo is a local test asset.
 */
const PHOTO = 'test-assets/portrait.jpg';
const ORIGIN = 'http://localhost:5198';

test('installable manifest with PNG icons', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(new URL(href!, ORIGIN).href)).json();
  expect(manifest.display).toBe('standalone');
  const sizes = (manifest.icons as { sizes: string; type: string; purpose: string }[]).map((i) => `${i.sizes} ${i.type} ${i.purpose}`);
  expect(sizes).toEqual(expect.arrayContaining(['192x192 image/png any', '512x512 image/png any', '512x512 image/png maskable']));
  for (const icon of manifest.icons as { src: string }[]) expect((await request.get(new URL(icon.src, ORIGIN).href)).ok()).toBe(true);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});

test('after one visit the app, the face model and the simulation work offline', async ({ page, context }) => {
  test.skip(!existsSync(PHOTO), 'needs a local test photo in test-assets/ (git-ignored)');
  const offending = watchNetwork(page, ORIGIN);
  await page.goto('/');
  // The service worker activates only after it has precached everything.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls = (await Promise.all(names.map(async (n) => (await (await caches.open(n)).keys()).map((r) => r.url)))).flat();
    return urls.map((u) => new URL(u).pathname);
  });
  for (const f of ['/models/face_landmarker.task', '/mediapipe/wasm/vision_wasm_internal.wasm', '/mediapipe/wasm/vision_wasm_internal.js', '/index.html'])
    expect(cached, f).toContain(f);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await setupVault(page);
  const caseId = await newCaseWithFrontal(page, PHOTO);
  await page.goto(`/#/doctor/case/${caseId}/simulate`);
  await expect(page.getByRole('img', { name: 'بعد', exact: true })).toHaveAttribute('data-ready', 'true', { timeout: 90_000 });
  await context.setOffline(false);
  expect(offending, offending.join('\n')).toEqual([]);
});
