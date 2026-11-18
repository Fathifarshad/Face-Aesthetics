import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { setupVault, signConsent, watchNetwork } from './helpers';

/**
 * R2 automatic capture with a fake camera: Chromium plays the test photo as the camera picture. A still picture is
 * perfectly steady, so the live checks pass once the face is found. The photo becomes a one-second Y4M video
 * (the format Chromium's fake camera reads) with ffmpeg; without ffmpeg on the PATH the tests are skipped.
 */
const PHOTO = 'test-assets/portrait.jpg';
const FAKE = resolve('test-results/fake-camera.y4m');
function makeFakeCamera(): boolean {
  if (!existsSync(PHOTO)) return false;
  if (existsSync(FAKE)) return true;
  try {
    mkdirSync('test-results', { recursive: true });
    // Head-and-shoulders crop of the shared test portrait (820 × 1024): the face fills about half the frame height,
    // as a patient in front of the phone would. Another portrait.jpg may need another crop.
    const vf = 'crop=380:470:227:0,scale=760:940,format=yuv420p';
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-loop',
      '1',
      '-i',
      PHOTO,
      '-t',
      '1',
      '-r',
      '10',
      '-vf',
      vf,
      FAKE,
    ]);
    return true;
  } catch {
    return false;
  }
}
const haveCamera = makeFakeCamera();
const shots = 'test-results/screens';

test.use({
  permissions: ['camera'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${FAKE}`,
    ],
  },
});

async function openCamera(page: Page, code: string) {
  await setupVault(page, '/#/doctor/new');
  await page.getByLabel('نام نمایشی').fill('بیمار آزمایشی');
  await page.getByLabel('شمارهٔ پرونده').fill(code);
  await page.getByLabel('سال تولد (میلادی)').fill('1980');
  await page.getByRole('button', { name: /آنالیز کامل چهره ·/ }).click();
  await page.getByRole('button', { name: /^لب ·/ }).click();
  await page.getByRole('button', { name: 'ایجاد و ادامه' }).click();
  await expect(page).toHaveURL(/intake/);
  await signConsent(page, 'analysis');
  await page.getByRole('button', { name: 'عکس‌های مراجع' }).last().click();
  await expect(page).toHaveURL(/capture/);
  const frontal = page.locator('.card', { hasText: 'روبه‌رو — بی‌حالت' }).first();
  const camera = frontal.getByRole('button', { name: 'دوربین', exact: true });
  if (!(await camera.isVisible())) await frontal.locator('button[aria-expanded]').click();
  await camera.click();
  return page.getByRole('dialog', { name: 'روبه‌رو — بی‌حالت' });
}

test.describe('camera auto capture (R2)', () => {
  test.skip(!haveCamera, 'needs a local test photo in test-assets/ (git-ignored) and ffmpeg');

  test('takes the photo by itself once every check holds, then shows the confirm step', async ({ page }) => {
    const offending = watchNetwork(page);
    const cam = await openCamera(page, 'CAM-1');
    await expect(cam.getByRole('switch', { name: 'عکس خودکار' })).toHaveAttribute('aria-checked', 'true');
    await expect(cam.getByRole('switch', { name: 'صدای شاتر' })).toHaveAttribute('aria-checked', 'true');
    await expect(cam.locator('[data-pose-hint]').first()).not.toHaveAttribute('data-pose-hint', '', {
      timeout: 60_000,
    });
    await page.screenshot({ path: `${shots}/r2-camera.png` });
    await expect(page.getByRole('dialog', { name: 'تأیید عکس' })).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: `${shots}/r2-auto-confirm.png`, fullPage: true });
    expect(offending, offending.join('\n')).toEqual([]);
  });

  test('with auto capture off nothing is taken until the shutter is pressed; the choice is remembered', async ({
    page,
  }) => {
    const cam = await openCamera(page, 'CAM-2');
    await cam.getByRole('switch', { name: 'عکس خودکار' }).click();
    await cam.getByRole('switch', { name: 'صدای شاتر' }).click();
    await expect(cam.locator('[data-pose-hint="ready"]')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2500);
    await expect(page.getByRole('dialog', { name: 'تأیید عکس' })).toHaveCount(0);
    await cam.getByRole('button', { name: 'بستن' }).click();

    const frontal = page.locator('.card', { hasText: 'روبه‌رو — بی‌حالت' }).first();
    await frontal.getByRole('button', { name: 'دوربین', exact: true }).click();
    const again = page.getByRole('dialog', { name: 'روبه‌رو — بی‌حالت' });
    await expect(again.getByRole('switch', { name: 'عکس خودکار' })).toHaveAttribute('aria-checked', 'false');
    await expect(again.getByRole('switch', { name: 'صدای شاتر' })).toHaveAttribute('aria-checked', 'false');
    await expect(again.getByRole('button', { name: 'گرفتن عکس' })).toBeEnabled({ timeout: 60_000 });
    await again.getByRole('button', { name: 'گرفتن عکس' }).click();
    await expect(page.getByRole('dialog', { name: 'تأیید عکس' })).toBeVisible({ timeout: 60_000 });
  });
});
