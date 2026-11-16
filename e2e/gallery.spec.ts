import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { newCaseWithFrontal, setupVault, signConsent } from './helpers';

/**
 * M8 acceptance (docs/PRD.md §13): no photo in a shareable output without level-3 consent; revocation works.
 * Also: capture needs level 1, the "after" photo's framing is checked, and the simulation can be compared with
 * the real result. Synthetic data only; the photo is a local test asset (git-ignored).
 */
const PHOTO = 'test-assets/portrait.jpg';
const OUT = 'test-results/gallery';

/** Frontal "after" photo from a buffer; returns whether the framing warning was shown. */
async function saveAfterFrontal(page: Page, buffer: Buffer): Promise<boolean> {
  await page.getByRole('tab', { name: /بعد/ }).click();
  const slot = page.locator('.card', { hasText: 'روبه‌رو — بی‌حالت' }).first();
  // A slot that already has its photo is collapsed: open it to retake.
  if ((await slot.locator('input[type=file]').count()) === 0) await slot.locator('button[aria-expanded]').first().click();
  await slot.locator('input[type=file]').setInputFiles({ name: 'after.jpg', mimeType: 'image/jpeg', buffer });
  const dialog = page.getByRole('dialog', { name: 'تأیید عکس' });
  await expect(dialog).toBeVisible({ timeout: 90_000 });
  const misframed = await dialog.locator('[data-misframed]').isVisible();
  await page.getByRole('button', { name: /تأیید و ذخیره|استفاده با وجود ایراد/ }).click();
  await expect(dialog).toBeHidden();
  return misframed;
}

/** The test photo cropped to its centre (a closer camera): same face, other framing. */
const cropped = (page: Page, jpeg: Buffer) =>
  page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * 0.7);
    c.height = Math.round(bmp.height * 0.7);
    c.getContext('2d')!.drawImage(bmp, bmp.width * 0.15, bmp.height * 0.15, c.width, c.height, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.92).split(',')[1]!;
  }, jpeg.toString('base64'));

test.beforeEach(async ({ page }) => {
  // No system share sheet in tests: the gallery file is downloaded.
  await page.addInitScript(() => Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }));
});

test('capture needs the signed level-1 consent', async ({ page }) => {
  await setupVault(page);
  await page.goto('/#/doctor/new');
  await page.getByLabel('نام نمایشی').fill('بیمار آزمایشی');
  await page.getByLabel('شمارهٔ پرونده').fill('T-C1');
  await page.getByLabel('سال تولد (میلادی)').fill('1980');
  await page.getByRole('button', { name: 'زن', exact: true }).click();
  await page.getByRole('button', { name: 'ایجاد و ادامه' }).click();
  await expect(page).toHaveURL(/intake/);
  await expect(page.getByRole('button', { name: 'عکس‌های مراجع' }).last()).toBeDisabled();
  await page.goto(page.url().replace(/intake$/, 'capture'));
  await expect(page.locator('[data-capture-blocked]')).toBeVisible();
  await page.goto(page.url().replace(/capture$/, 'intake'));
  await signConsent(page, 'analysis');
  await expect(page.getByRole('button', { name: 'عکس‌های مراجع' }).last()).toBeEnabled();
});

test('level 3 opens the gallery file, revocation closes it; simulation vs real result', async ({ page }) => {
  test.skip(!existsSync(PHOTO), 'needs a local test photo in test-assets/ (git-ignored)');
  test.setTimeout(240_000);
  mkdirSync(OUT, { recursive: true });
  await setupVault(page);
  const caseId = await newCaseWithFrontal(page, PHOTO, 'مرد');
  const jpeg = readFileSync(PHOTO);

  // The same framing passes; a closer camera is flagged (PRD F8.2).
  expect(await saveAfterFrontal(page, Buffer.from(await cropped(page, jpeg), 'base64'))).toBe(true);
  expect(await saveAfterFrontal(page, jpeg)).toBe(false);

  // Without level 3: nothing can leave.
  await page.goto(`/#/doctor/case/${caseId}/gallery`);
  const exportBox = page.locator('[data-export]');
  await expect(exportBox.getByText('بدون رضایت سطح ۳، فایل اشتراکی ساخته نمی‌شود.')).toBeVisible();
  await expect(page.locator('[data-pair="frontal"]').getByText('در خروجی‌ها نمی‌آید')).toBeVisible();
  await expect(exportBox.getByRole('button', { name: 'ساخت فایل' })).toHaveCount(0);

  // Level 3 "internal" with the eyes covered: only the internal purpose is offered.
  await signConsent(page, 'beforeAfter', 'فقط داخلی', true);
  await expect(page.locator('[data-pair="frontal"]').getByText('در خروجی‌ها نمی‌آید')).toHaveCount(0);
  await expect(exportBox.getByRole('button', { name: 'فقط داخلی' })).toBeVisible();
  await expect(exportBox.getByRole('button', { name: 'آموزشی' })).toHaveCount(0);
  await expect(exportBox.getByText('چشم‌ها پوشانده می‌شود')).toBeVisible();
  const download = page.waitForEvent('download');
  await exportBox.getByRole('button', { name: 'ساخت فایل' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('before-after-frontal.jpg');
  await file.saveAs(`${OUT}/before-after-masked.jpg`);
  await expect(page.locator('[data-export-state="done"]')).toBeVisible();
  await page.screenshot({ path: `${OUT}/gallery.png`, fullPage: true });

  // Revocation (PRD F8.6): the file can no longer be made, the history keeps the signed consent.
  const card = page.locator('[data-consent="beforeAfter"]');
  await card.getByRole('button', { name: 'پس گرفتن رضایت' }).click();
  await card.getByRole('button', { name: 'بله، پس گرفته شود' }).click();
  await expect(card).toHaveAttribute('data-state', 'none');
  await expect(card.getByText('سابقه')).toBeVisible();
  await expect(exportBox.getByText('بدون رضایت سطح ۳، فایل اشتراکی ساخته نمی‌شود.')).toBeVisible();
  await expect(page.locator('[data-pair="frontal"]').getByText('در خروجی‌ها نمی‌آید')).toBeVisible();

  // Simulation vs real result (PRD F8.5): save a simulation, then compare it with the aligned "after" photo.
  await page.goto(`/#/doctor/case/${caseId}/simulate`);
  await expect(page.getByRole('img', { name: 'بعد', exact: true })).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await page.getByRole('button', { name: 'ذخیرهٔ تصویر شبیه‌سازی' }).click();
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 30_000 });
  await page.goto(`/#/doctor/case/${caseId}/compare`);
  await page.getByRole('button', { name: 'شبیه‌سازی در برابر نتیجهٔ واقعی' }).click();
  await expect(page.locator('[data-sim-vs-real]')).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${OUT}/sim-vs-real.png`, fullPage: true });
});
