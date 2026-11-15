import { expect, type Page } from '@playwright/test';

/** Passphrase used by the tests. Every test starts with empty storage, so the vault is created each time. */
export const PASSPHRASE = 'test-passphrase-1';

/** First visit to the doctor area: creates the vault, returns the recovery code shown once. */
export async function setupVault(page: Page, path = '/#/doctor', passphrase = PASSPHRASE): Promise<string> {
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'ساخت رمز پنل پزشک' })).toBeVisible();
  await page.getByLabel('رمز عبور', { exact: true }).fill(passphrase);
  await page.getByLabel('تکرار رمز عبور').fill(passphrase);
  await page.getByRole('button', { name: 'ساخت رمز و ادامه' }).click();
  await expect(page.getByRole('heading', { name: 'کد بازیابی را یادداشت کنید' })).toBeVisible({ timeout: 30_000 });
  const code = (await page.getByLabel('کد بازیابی').textContent())!.trim();
  await page.getByLabel('کد را یادداشت کردم').check();
  await page.getByRole('button', { name: 'ورود به پنل پزشک' }).click();
  return code;
}

export async function unlockVault(page: Page, passphrase = PASSPHRASE): Promise<void> {
  await expect(page.getByRole('heading', { name: 'پنل پزشک قفل است' })).toBeVisible();
  await page.getByLabel('رمز عبور', { exact: true }).fill(passphrase);
  await page.getByRole('button', { name: 'باز کردن قفل' }).click();
  await expect(page.getByRole('heading', { name: 'پنل پزشک قفل است' })).toBeHidden({ timeout: 30_000 });
}

/**
 * Creates a synthetic case and saves `photo` as its frontal "before" photo. Returns the case id.
 * The vault must already be open.
 */
export async function newCaseWithFrontal(page: Page, photo: string, sex: 'زن' | 'مرد' = 'زن'): Promise<string> {
  await page.goto('/#/doctor/new');
  await page.getByLabel('نام نمایشی').fill('بیمار آزمایشی');
  await page.getByLabel('شمارهٔ پرونده').fill('T-SIM');
  await page.getByLabel('سال تولد (میلادی)').fill('1980');
  await page.getByRole('button', { name: sex, exact: true }).click();
  // The full-face analysis service is selected by default.
  await page.getByRole('button', { name: 'ایجاد و ادامه' }).click();
  await expect(page).toHaveURL(/intake/);
  for (const label of ['عکاسی', 'آنالیز', 'ذخیره‌سازی روی دستگاه']) await page.getByRole('switch', { name: label }).click();
  await page.getByRole('button', { name: 'عکس‌های مراجع' }).last().click();
  await expect(page).toHaveURL(/capture/);
  const frontal = page.locator('.card', { hasText: 'روبه‌رو — بی‌حالت' }).first();
  await frontal.locator('input[type=file]').setInputFiles(photo);
  await expect(page.getByRole('dialog', { name: 'تأیید عکس' })).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: /تأیید و ذخیره|استفاده با وجود ایراد/ }).click();
  await expect(page.getByText(/1 از \d+ عکس لازم/).first()).toBeVisible();
  return /case\/([^/]+)\//.exec(page.url())![1]!;
}
