import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';

const shots = 'test-results/screens';

test('home opens in Persian RTL with the black & gold theme', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'تناسب' })).toBeVisible();
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(10, 10, 11)');
  await page.screenshot({ path: `${shots}/01-home.png` });
});

const PHOTO = 'test-assets/portrait.jpg';

test('doctor flow: patient → intake → photo confirm → analysis → age → plan → sign-off → report', async ({ page }) => {
  test.skip(!existsSync(PHOTO), 'needs a local test photo in test-assets/ (git-ignored)');
  await page.goto('/#/doctor/new');
  await page.getByLabel('نام نمایشی').fill('بیمار آزمایشی');
  await page.getByLabel('شمارهٔ پرونده').fill('T-001');
  await page.getByLabel('سال تولد (میلادی)').fill('1980');
  await page.getByRole('button', { name: /آنالیز کامل چهره ·/ }).click();
  await page.getByRole('button', { name: /^لب ·/ }).click();
  await page.screenshot({ path: `${shots}/02-new-case.png` });
  await page.getByRole('button', { name: 'ایجاد و ادامه' }).click();

  await expect(page).toHaveURL(/intake/);
  for (const label of ['عکاسی', 'آنالیز', 'ذخیره‌سازی روی دستگاه', 'ارسال پرونده به اپ مراجع'])
    await page.getByRole('switch', { name: label }).click();
  await page.getByRole('switch', { name: 'سابقهٔ تبخال' }).click();
  await page.getByRole('button', { name: 'عکس‌های مراجع' }).last().click();

  await expect(page).toHaveURL(/capture/);
  await expect(page.getByText(/از ۷ عکس لازم/).first()).toBeVisible();
  await page.screenshot({ path: `${shots}/03-capture.png` });
  const frontal = page.locator('.card', { hasText: 'روبه‌رو — بی‌حالت' }).first();
  await frontal.locator('input[type=file]').setInputFiles(PHOTO);
  await expect(page.getByRole('dialog', { name: 'تأیید عکس' })).toBeVisible({ timeout: 90_000 });
  await page.screenshot({ path: `${shots}/04-confirm.png`, fullPage: true });
  const accept = page.getByRole('button', { name: /تأیید و ذخیره|استفاده با وجود ایراد/ });
  await accept.click();
  await expect(page.getByText(/۱ از ۷ عکس لازم/).first()).toBeVisible();

  await page.getByRole('button', { name: 'آنالیز چهره' }).last().click();
  await expect(page).toHaveURL(/analysis/);
  await expect(page.getByRole('heading', { name: 'گودی زیر چشم' })).toBeVisible();
  await page.screenshot({ path: `${shots}/05-analysis.png`, fullPage: true });
  // grade two volume findings
  for (const name of ['افت حجم میانهٔ صورت', 'افتادگی کنار فک (جول)']) {
    const card = page.locator('article', { hasText: name }).first();
    await card.getByRole('button', { name: '۳' }).click();
  }
  await page.getByRole('button', { name: 'لب', exact: true }).click();
  const lip = page.locator('article', { hasText: 'حجم و تعریف لب' }).first();
  await lip.getByRole('button', { name: 'ویرایش شدت' }).click();
  await lip.getByRole('button', { name: '۲' }).click();

  await page.getByRole('button', { name: 'تعیین سن هدف' }).click();
  await expect(page).toHaveURL(/age/);
  await page.getByRole('button', { name: 'شاداب' }).click();
  await page.getByRole('button', { name: 'ساخت شبیه‌سازی' }).click();
  await expect(page.getByText('شبیه‌سازی ذخیره شد', { exact: false })).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: `${shots}/06-age.png`, fullPage: true });

  await page.getByRole('button', { name: 'طرح درمان' }).last().click();
  await expect(page).toHaveURL(/plan/);
  await expect(page.getByText('زمان‌بندی جلسات')).toBeVisible();
  await expect(page.getByText('سابقهٔ تبخال (دور دهان)').first()).toBeVisible();
  await page.screenshot({ path: `${shots}/07-plan.png`, fullPage: true });

  await page.getByRole('link', { name: 'MD Codes' }).click();
  await expect(page.getByText('دادهٔ دارای مجوز MD Codes نصب نشده است', { exact: false })).toBeVisible();
  await page.screenshot({ path: `${shots}/08-mdcodes.png`, fullPage: true });
  await page.goBack();

  // settings needed for sign-off
  await page.goto('/#/settings');
  await page.getByLabel('نام پزشک').fill('دکتر آزمایشی');
  await page.getByLabel('شمارهٔ نظام پزشکی').fill('12345');
  await page.getByRole('button', { name: 'ذخیره' }).click();
  await page.goBack();
  await page.getByRole('button', { name: 'تأیید و گزارش' }).click();
  await expect(page).toHaveURL(/report/);
  for (const label of ['همهٔ یافته‌ها بررسی شد', 'طرح درمان تأیید شد', 'منع مصرف‌ها بررسی شد', 'غربالگری بررسی شد'])
    await page.getByRole('switch', { name: label }).click();
  const pad = page.getByLabel('امضا', { exact: true });
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 30, { steps: 8 });
  await page.mouse.move(box.x + 220, box.y + 90, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'امضا و تأیید' }).click();
  await expect(page.getByText('تأیید شده در', { exact: false })).toBeVisible();
  await page.screenshot({ path: `${shots}/09-report.png`, fullPage: true });

  await page.getByRole('link', { name: 'گزارش فارسی (PDF)' }).click();
  await expect(page.getByText('نواحی‌ای که ممکن است از بهبود بهره ببرند')).toBeVisible();
  await page.screenshot({ path: `${shots}/10-print.png`, fullPage: true });

  // persisted after reload
  await page.reload();
  await expect(page.getByText('نواحی‌ای که ممکن است از بهبود بهره ببرند')).toBeVisible();
});
