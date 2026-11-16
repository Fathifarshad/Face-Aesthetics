import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { newCaseWithFrontal, setupVault, signConsent } from './helpers';

/**
 * M9 acceptance (docs/PRD.md §13): no report without the doctor's approval; the simulation label is on the image.
 * Also: the line items carry the same numbers as the plan page, the doctor's note is printed, and a change after
 * the sign-off makes the approval stale until the doctor signs again. Synthetic data; the photo is a local test asset.
 */
const PHOTO = 'test-assets/portrait.jpg';
const OUT = 'test-results/report';

async function signOff(page: Page, caseId: string): Promise<void> {
  await page.goto(`/#/doctor/case/${caseId}/report`);
  for (const label of ['همهٔ یافته‌ها بررسی شد', 'طرح درمان تأیید شد', 'منع مصرف‌ها بررسی شد', 'غربالگری بررسی شد'])
    await page.getByRole('switch', { name: label }).click();
  const pad = page.getByLabel('امضا', { exact: true });
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 30, { steps: 8 });
  await page.mouse.move(box.x + 220, box.y + 90, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'امضا و تأیید' }).click();
  await expect(page.locator('[data-approval="fresh"]')).toBeVisible();
}

/**
 * The burned-in label bar at the bottom of the report's simulation image: a dark band (bg token at 72 %) with light
 * text in it. Returns the share of dark pixels and the count of light pixels in the band's middle row.
 */
const labelBand = (page: Page) =>
  page.locator('[data-sim-image]').evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const font = Math.max(11, Math.round((c.width * 11) / 390));
    const bar = Math.round(font * 2.2);
    const band = ctx.getImageData(0, c.height - bar + 2, c.width, bar - 4).data;
    let dark = 0;
    let light = 0;
    for (let i = 0; i < band.length; i += 4) {
      const v = (band[i]! + band[i + 1]! + band[i + 2]!) / 3;
      if (v < 90) dark++;
      if (v > 180) light++;
    }
    return { dark: dark / (band.length / 4), light };
  });

test('report needs a fresh sign-off; items match the plan; label on the simulation; note printed', async ({ page }) => {
  test.skip(!existsSync(PHOTO), 'needs a local test photo in test-assets/ (git-ignored)');
  test.setTimeout(240_000);
  mkdirSync(OUT, { recursive: true });
  await setupVault(page);
  const caseId = await newCaseWithFrontal(page, PHOTO);

  // Clinic profile and a lip-filler price.
  await page.goto('/#/admin');
  await page.getByRole('button', { name: 'پزشک و کلینیک' }).click();
  await page.getByLabel('نام پزشک').fill('دکتر آزمایشی');
  await page.getByLabel('شمارهٔ نظام پزشکی').fill('12345');
  await page.getByRole('button', { name: 'تعرفه و ایمنی' }).click();
  await page.locator('[data-tariff="filler.lip"]').fill('9000000');
  await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات' }).click();
  await expect(page.getByRole('button', { name: 'ذخیره شد' })).toBeVisible();

  // Level 3 so the report carries photos (PRD F8.4).
  await page.goto(`/#/doctor/case/${caseId}/gallery`);
  await signConsent(page, 'beforeAfter', 'فقط داخلی', true);

  // One confirmed concern: lips, grade 3 (its default option is the lip filler).
  await page.goto(`/#/doctor/case/${caseId}/grading`);
  await expect(page.getByRole('button', { name: 'اندازه‌گیری دوباره' })).toBeEnabled({ timeout: 90_000 });
  const lips = page.locator('li', { has: page.getByRole('heading', { name: 'حجم و فرم لب', exact: true }) });
  await lips.getByRole('radio', { name: '3' }).click();
  await expect(lips.getByText('ویرایش‌شده')).toBeVisible();

  // No saved simulation yet and no sign-off: the print route refuses (F9.2).
  await page.goto(`/#/doctor/case/${caseId}/print?lang=fa`);
  await expect(page.locator('[data-report-blocked]')).toContainText('هنوز تأیید نشده');

  await page.goto(`/#/doctor/case/${caseId}/simulate`);
  await expect(page.getByRole('img', { name: 'بعد', exact: true })).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await page.getByRole('button', { name: 'ذخیرهٔ تصویر شبیه‌سازی' }).click();
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 30_000 });

  // The plan page's numbers for the lip filler.
  await page.goto(`/#/doctor/case/${caseId}/plan`);
  const option = page.locator('article[data-concern="lip-volume"] [data-option="lip-volume.1.filler"]');
  const planAmount = await option.locator('[data-estimate]').getAttribute('data-estimate');
  const planCost = await option.locator('[data-cost]').getAttribute('data-cost');
  expect(planCost).toMatch(/^\d+-\d+$/);

  // Note, then sign.
  await page.goto(`/#/doctor/case/${caseId}/report`);
  await page.locator('[data-report-note]').fill('یادداشت آزمایشی پزشک');
  await page.locator('[data-report-note]').blur();
  await signOff(page, caseId);

  await page.goto(`/#/doctor/case/${caseId}/print?lang=fa`);
  const row = page.locator('[data-report-items] [data-item="lip-volume.1.filler"]');
  await expect(row).toBeVisible();
  await expect(row.locator('[data-amount]')).toHaveAttribute('data-amount', planAmount!);
  await expect(row.locator('[data-cost]')).toHaveAttribute('data-cost', planCost!);
  await expect(page.locator('[data-total-cost]')).toHaveAttribute('data-total-cost', planCost!);
  await expect(row).toContainText('Lp');
  await expect(row.locator('[data-draft]')).toBeVisible();
  await expect(page.locator('[data-report-note]')).toHaveText('یادداشت آزمایشی پزشک');
  await expect(page.locator('[data-sim-image]')).toBeVisible();
  const band = await labelBand(page);
  expect(band.dark).toBeGreaterThan(0.6);
  expect(band.light).toBeGreaterThan(10);
  await page.screenshot({ path: `${OUT}/print-fa.png`, fullPage: true });
  await page.goto(`/#/doctor/case/${caseId}/print?lang=en`);
  await expect(page.locator('[data-report-items]')).toContainText('Area');
  await page.screenshot({ path: `${OUT}/print-en.png`, fullPage: true });

  // A change after the sign-off (toxin brand on the plan) makes the approval stale (F9.2).
  await page.goto(`/#/doctor/case/${caseId}/plan`);
  await page.getByRole('radio', { name: 'OnabotulinumtoxinA' }).click();
  await expect(page.getByRole('radio', { name: 'OnabotulinumtoxinA' })).toHaveAttribute('aria-checked', 'true');
  await page.goto(`/#/doctor/case/${caseId}/print?lang=fa`);
  await expect(page.locator('[data-report-blocked]')).toContainText('تغییر کرده است');
  await page.goto(`/#/doctor/case/${caseId}/report`);
  await expect(page.locator('[data-approval="stale"]')).toBeVisible();
  await expect(page.getByRole('link', { name: 'گزارش فارسی (PDF)' })).toHaveCount(0);
  await page.screenshot({ path: `${OUT}/report-stale.png`, fullPage: true });
  // The stale case is no longer "signed": the simulation page opens again.
  await page.goto(`/#/doctor/case/${caseId}/simulate`);
  await expect(page.getByRole('button', { name: 'ذخیرهٔ تصویر شبیه‌سازی' })).toBeEnabled({ timeout: 60_000 });

  // Signing again restores the report.
  await signOff(page, caseId);
  await page.goto(`/#/doctor/case/${caseId}/print?lang=fa`);
  await expect(page.locator('[data-report-items]')).toBeVisible();
});
