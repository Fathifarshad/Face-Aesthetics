import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { newCaseWithFrontal, setupVault, watchNetwork } from './helpers';

/**
 * Release 1.1 R1: backup in the admin panel, restore on a second device with another vault passphrase.
 * Restore merges (newer wins, nothing deleted) and does not bring back a patient deleted there. Synthetic data;
 * the photo is a local test asset. Each browser context is a separate device (its own IndexedDB).
 */
const PHOTO = 'test-assets/portrait.jpg';
const OUT = 'test-results/backup';
const BACKUP_PASS = 'backup-pass-1';

async function openBackupTab(page: Page) {
  await page.goto('/#/admin');
  await page.getByRole('button', { name: 'داده‌ها', exact: true }).click();
}

async function restore(page: Page, path: string, password: string) {
  const form = page.locator('[data-backup="restore"]');
  await form.locator('input[type=file]').setInputFiles(path);
  await form.getByLabel('رمز فایل پشتیبان').fill(password);
  await form.getByRole('button', { name: 'بازگردانی' }).click();
  return form;
}

/** Decrypts the case's photos with the vault of this page, through the app's own module (dev server). */
const photoSizes = (page: Page, caseId: string) =>
  page.evaluate(async (id) => {
    const url = '/src/db/images.ts'; // a variable: resolved by the dev server in the page, not by the type checker
    const images = (await import(/* @vite-ignore */ url)) as typeof import('../src/db/images');
    return (await images.listPhotos(id)).map((p) => p.blob.size);
  }, caseId);

test('backup → restore on another device, merge rules', async ({ page, browser }) => {
  test.skip(!existsSync(PHOTO), 'needs a local test photo in test-assets/ (git-ignored)');
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const noShare = () => Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  await page.addInitScript(noShare);
  const offending = watchNetwork(page);

  // Device A: one case with a photo, then the backup.
  await setupVault(page);
  const caseId = await newCaseWithFrontal(page, PHOTO);
  const original = await photoSizes(page, caseId);
  expect(original).toHaveLength(1);
  await openBackupTab(page);
  const make = page.locator('[data-backup="make"]');
  await make.getByLabel('رمز فایل پشتیبان', { exact: true }).fill(BACKUP_PASS);
  await make.getByLabel('تکرار رمز فایل پشتیبان').fill('something-else');
  await make.getByRole('button', { name: 'ساخت فایل پشتیبان' }).click();
  await expect(make.getByText('دو رمز یکسان نیستند. دوباره وارد کنید.')).toBeVisible();
  await make.getByLabel('تکرار رمز فایل پشتیبان').fill(BACKUP_PASS);
  const download = page.waitForEvent('download');
  await make.getByRole('button', { name: 'ساخت فایل پشتیبان' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^neva-backup-\d{4}-\d{2}-\d{2}\.nevabak$/);
  const path = `${OUT}/${file.suggestedFilename()}`;
  await file.saveAs(path);
  await expect(make.getByText(/ساخته شد/)).toBeVisible();
  // Nothing of the content is readable in the file.
  const raw = readFileSync(path);
  for (const plain of ['بیمار آزمایشی', 'T-SIM', 'مراجع آزمایشی', 'portrait']) expect(raw.includes(Buffer.from(plain))).toBe(false);

  // Device B: another vault passphrase.
  const other = await browser.newContext();
  const b = await other.newPage();
  await b.addInitScript(noShare);
  const offendingB = watchNetwork(b);
  await setupVault(b, '/#/doctor', 'other-passphrase-2');
  await openBackupTab(b);
  let form = await restore(b, path, 'wrong-password');
  await expect(form.getByText('رمز فایل پشتیبان درست نیست.')).toBeVisible({ timeout: 30_000 });
  form = await restore(b, path, BACKUP_PASS);
  await expect(form.getByText(/^بازگردانی انجام شد/)).toBeVisible({ timeout: 60_000 });

  // The patient, the case and its photo are there, sealed with device B's key.
  await b.goto('/#/doctor');
  await expect(b.getByText('بیمار آزمایشی').first()).toBeVisible();
  expect(await photoSizes(b, caseId)).toEqual(original);
  await b.goto(`/#/doctor/case/${caseId}/capture`);
  await expect(b.getByText(/1 از \d+ عکس لازم/).first()).toBeVisible();

  // A second restore of the same file changes nothing.
  await openBackupTab(b);
  form = await restore(b, path, BACKUP_PASS);
  await expect(form.getByText('بازگردانی انجام شد: 0 رکورد افزوده و 0 رکورد به‌روز شد.')).toBeVisible({ timeout: 60_000 });

  // A patient deleted on device B does not come back.
  await b.goto('/#/doctor');
  await b.getByText('بیمار آزمایشی').first().click();
  await expect(b).toHaveURL(/patient\//);
  b.once('dialog', (d) => void d.accept());
  await b.getByRole('button', { name: 'حذف کامل بیمار' }).click();
  await expect(b).toHaveURL(/#\/doctor$/);
  await openBackupTab(b);
  form = await restore(b, path, BACKUP_PASS);
  await expect(form.getByText(/^1 بیمار برنگشت/)).toBeVisible({ timeout: 60_000 });
  await b.goto('/#/doctor');
  await expect(b.getByText('بیمار آزمایشی')).toHaveCount(0);

  // Another file is refused.
  await openBackupTab(b);
  form = await restore(b, PHOTO, BACKUP_PASS);
  await expect(form.getByText('این فایل، پشتیبان نوا نیست.')).toBeVisible();

  await other.close();
  expect(offending).toEqual([]);
  expect(offendingB).toEqual([]);
});
