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

type ConsentScope = 'analysis' | 'cloudRender' | 'beforeAfter';

/**
 * Signs one consent level (PRD F8.3) in its card on the current page: name, a drawn signature, and for
 * level 3 the use. The card must be visible (intake: level 1; gallery: level 3; consent page: all).
 */
export async function signConsent(
  page: Page,
  scope: ConsentScope,
  use: 'فقط داخلی' | 'آموزشی' | 'انتشار عمومی' = 'فقط داخلی',
  maskEyes = true,
): Promise<void> {
  const card = page.locator(`[data-consent="${scope}"]`).first();
  await card.getByRole('button', { name: 'ثبت این رضایت' }).click();
  if (scope === 'beforeAfter') {
    await card.getByRole('button', { name: use, exact: true }).click();
    const sw = card.getByRole('switch', { name: 'چشم‌ها در هر نسخهٔ اشتراکی پوشانده شود' });
    if ((await sw.getAttribute('aria-checked')) !== String(maskEyes)) await sw.click();
  }
  await card.getByLabel('نام و نام خانوادگی مراجع').fill('مراجع آزمایشی');
  const pad = card.locator('canvas');
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 30, { steps: 8 });
  await page.mouse.move(box.x + 220, box.y + 90, { steps: 8 });
  await page.mouse.up();
  await card.getByRole('button', { name: 'ثبت رضایت' }).click();
  await expect(card).toHaveAttribute('data-state', 'active');
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
  await signConsent(page, 'analysis');
  await page.getByRole('button', { name: 'عکس‌های مراجع' }).last().click();
  await expect(page).toHaveURL(/capture/);
  const frontal = page.locator('.card', { hasText: 'روبه‌رو — بی‌حالت' }).first();
  await frontal.locator('input[type=file]').setInputFiles(photo);
  await expect(page.getByRole('dialog', { name: 'تأیید عکس' })).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: /تأیید و ذخیره|استفاده با وجود ایراد/ }).click();
  await expect(page.getByText(/1 از \d+ عکس لازم/).first()).toBeVisible();
  return /case\/([^/]+)\//.exec(page.url())![1]!;
}
