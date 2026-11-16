import { expect, test } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { newCaseWithFrontal, setupVault, signConsent, watchNetwork } from './helpers';

/**
 * M10 acceptance (docs/PRD.md §13, SUPERPROMPT rule 8): no network request carries a photo without the level-2
 * consent. The realistic render is off until the clinic switches it on, refuses without level 2, works (mock, still
 * no request) with it, and refuses again after revocation. Synthetic data; the photo is a local test asset.
 */
const PHOTO = 'test-assets/portrait.jpg';

test('realistic render: clinic switch, level-2 consent, revocation; no request ever leaves with a photo', async ({ page }) => {
  test.skip(!existsSync(PHOTO), 'needs a local test photo in test-assets/ (git-ignored)');
  test.setTimeout(240_000);
  mkdirSync('test-results/privacy', { recursive: true });
  const offending = watchNetwork(page);
  await setupVault(page);
  const caseId = await newCaseWithFrontal(page, PHOTO);
  const sim = `/#/doctor/case/${caseId}/simulate`;
  const after = page.getByRole('img', { name: 'بعد', exact: true });
  const box = page.locator('[data-cloud-render]');

  // Default: the clinic switch is off and there is no render button at all.
  await page.goto(sim);
  await expect(after).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await expect(box).toHaveCount(0);

  await page.goto('/#/admin');
  await page.getByRole('button', { name: 'داده‌ها' }).click();
  await page.locator('[data-setting="cloudRender"]').getByRole('switch').click();
  await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات' }).click();
  await expect(page.getByRole('button', { name: 'ذخیره شد' })).toBeVisible();

  // Switch on, level 1 only: refused, with a way to the consent page.
  await page.goto(sim);
  await expect(after).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await expect(box).toHaveAttribute('data-cloud-render', 'noConsent');
  await expect(box.getByRole('button', { name: 'رندر واقع‌گرایانه' })).toHaveCount(0);
  await box.getByRole('link', { name: 'رضایت‌های مراجع' }).click();
  await expect(page).toHaveURL(/\/consent$/);
  const consentPage = page.url();
  await signConsent(page, 'cloudRender');

  // Level 2 signed: the mock answers with the browser preview; nothing left the device.
  await page.goto(sim);
  await expect(after).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await expect(box).toHaveAttribute('data-cloud-render', 'ready');
  await box.getByRole('button', { name: 'رندر واقع‌گرایانه' }).click();
  const result = box.locator('[data-render-result="mock"]');
  await expect(result).toBeVisible({ timeout: 30_000 });
  expect(await result.evaluate((img: HTMLImageElement) => img.decode().then(() => img.naturalWidth))).toBeGreaterThan(100);
  await expect(box.getByText('هنوز سرویس واقعی وصل نیست')).toBeVisible();
  await box.screenshot({ path: 'test-results/privacy/cloud-render.png' });

  // Revoked: refused again from that moment.
  await page.goto(consentPage);
  const card = page.locator('[data-consent="cloudRender"]');
  await card.getByRole('button', { name: 'پس گرفتن رضایت' }).click();
  await card.getByRole('button', { name: 'بله، پس گرفته شود' }).click();
  await expect(card).toHaveAttribute('data-state', 'none');
  await page.goto(sim);
  await expect(box).toHaveAttribute('data-cloud-render', 'noConsent');

  expect(offending, offending.join('\n')).toEqual([]);
});

test('the network watcher itself catches a body, another origin, a beacon and data in a URL', async ({ page }) => {
  const offending = watchNetwork(page);
  await page.route('https://render.invalid/**', (r) => r.abort());
  await page.goto('/');
  await page.evaluate(async () => {
    const send = (url: string, init?: RequestInit) => fetch(url, init).catch(() => null);
    await send('/upload', { method: 'POST', body: new Blob([new Uint8Array(2048)]) });
    await send('https://render.invalid/photo.jpg');
    navigator.sendBeacon('/beacon', 'x');
    await send(`/asset?d=${'A'.repeat(4000)}`);
  });
  await expect.poll(() => offending.length).toBe(4);
  expect(offending[0]).toContain('body 2048 B');
  expect(offending[1]).toContain('other origin');
  expect(offending.some((o) => o.startsWith('POST') && o.includes('/beacon'))).toBe(true);
  expect(offending.some((o) => o.includes('URL 4'))).toBe(true);
});
