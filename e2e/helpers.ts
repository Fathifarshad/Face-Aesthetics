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
