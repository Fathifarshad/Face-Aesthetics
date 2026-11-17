import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { newCaseWithFrontal, setupVault, signConsent, signOff } from './helpers';

/**
 * Screenshots for the user guides (docs/guides/, scripts/make-guides.mjs). Not an acceptance test: runs only with
 * GUIDE_SHOTS=1. Synthetic patient; every face picture (photo, simulation, canvas) is blurred before each shot, so no
 * face of the local test photo ever reaches a guide.
 */
const PHOTO = 'test-assets/portrait.jpg';
const OUT = 'test-results/guide';

const BLUR = `canvas:not([aria-label="امضا"]):not([data-signature]), img[src^="blob:"], img[src^="data:"] { filter: blur(18px) saturate(.6) !important; }`;

async function shot(page: Page, name: string, fullPage = false) {
  await page.addStyleTag({ content: BLUR });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 82, fullPage });
}

test('guide screenshots', async ({ page }) => {
  test.skip(process.env.GUIDE_SHOTS !== '1', 'run with GUIDE_SHOTS=1');
  test.skip(!existsSync(PHOTO), 'needs a local test photo in test-assets/ (git-ignored)');
  test.setTimeout(480_000);
  mkdirSync(OUT, { recursive: true });
  await page.addInitScript(() => Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }));

  await page.goto('/');
  await expect(page.getByText('مؤسسین')).toBeVisible();
  await shot(page, 'home');

  // Vault: first visit asks for a password.
  await page.goto('/#/doctor');
  await expect(page.getByRole('heading', { name: 'ساخت رمز پنل پزشک' })).toBeVisible();
  await shot(page, 'vault');
  await setupVault(page);
  await expect(page).toHaveURL(/#\/doctor$/);
  await shot(page, 'patients-empty');

  // Doctor profile and tariff (admin).
  await page.goto('/#/admin');
  await page.getByRole('button', { name: 'پزشک و کلینیک' }).click();
  await page.getByLabel('نام پزشک').fill('دکتر نمونه');
  await page.getByLabel('شمارهٔ نظام پزشکی').fill('00000');
  await shot(page, 'admin-clinic');
  await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات' }).click();
  await expect(page.getByRole('button', { name: 'ذخیره شد' })).toBeVisible();
  await page.getByRole('button', { name: 'تعرفه و ایمنی' }).click();
  await shot(page, 'admin-pricing');

  // New case: form, intake with level-1 consent, capture.
  await page.goto('/#/doctor/new');
  await page.getByLabel('نام نمایشی').fill('مراجع نمونه');
  await page.getByLabel('شمارهٔ پرونده').fill('N-001');
  await page.getByLabel('سال تولد (میلادی)').fill('1980');
  await page.getByRole('button', { name: 'زن', exact: true }).click();
  await shot(page, 'new-case');
  const caseId = await newCaseWithFrontal(page, PHOTO);
  await shot(page, 'capture');
  await page.goto(`/#/doctor/case/${caseId}/intake`);
  await page.getByRole('switch', { name: 'ارسال پرونده به اپ مراجع' }).click();
  await shot(page, 'intake');
  const patientId = /patient\/([^/?#]+)/.exec((await page.locator('a[href*="/doctor/patient/"]').first().getAttribute('href'))!)![1]!;

  // Grading.
  await page.goto(`/#/doctor/case/${caseId}/grading`);
  await expect(page.getByRole('button', { name: 'اندازه‌گیری دوباره' })).toBeEnabled({ timeout: 90_000 });
  const lips = page.locator('li', { has: page.getByRole('heading', { name: 'حجم و فرم لب', exact: true }) });
  await lips.getByRole('radio', { name: '3' }).click();
  await shot(page, 'grading');

  // Simulation: picture, sliders, MD Codes mode.
  await page.goto(`/#/doctor/case/${caseId}/simulate`);
  const after = page.getByRole('img', { name: 'بعد', exact: true });
  await expect(after).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await shot(page, 'simulate');
  await page.getByRole('button', { name: 'حدود 10 سال جوان‌تر' }).scrollIntoViewIfNeeded();
  await shot(page, 'simulate-age');
  await page.locator('#change-lip-volume').scrollIntoViewIfNeeded();
  await shot(page, 'simulate-options');
  await page.getByRole('button', { name: 'ذخیرهٔ تصویر شبیه‌سازی' }).click();
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 30_000 });
  const modeB = page.getByRole('radio', { name: 'حجم‌دهی فیلر بر اساس MD Codes' });
  await modeB.focus();
  await page.keyboard.press('Space');
  await expect(page.getByText(/PMC8012343/)).toBeVisible();
  await page.getByText(/PMC8012343/).scrollIntoViewIfNeeded();
  await shot(page, 'simulate-mdcodes');
  await page.getByRole('radio', { name: 'حجم‌دهی بر اساس ناحیه' }).focus();
  await page.keyboard.press('Space');

  // Plan, MD Codes page.
  await page.goto(`/#/doctor/case/${caseId}/plan`);
  await expect(page.locator('article[data-concern="lip-volume"]')).toBeVisible();
  await shot(page, 'plan');
  await page.locator('article[data-concern="lip-volume"]').scrollIntoViewIfNeeded();
  await shot(page, 'plan-lips');
  await page.goto(`/#/doctor/case/${caseId}/mdcodes`);
  await page.waitForTimeout(1500);
  await shot(page, 'mdcodes');

  // Gallery consent (level 3) and report with sign-off.
  await page.goto(`/#/doctor/case/${caseId}/gallery`);
  await signConsent(page, 'beforeAfter', 'فقط داخلی', true);
  await shot(page, 'gallery');
  await page.goto(`/#/doctor/case/${caseId}/report`);
  await page.locator('[data-report-note]').fill('دو هفته پس از تزریق برای کنترل مراجعه کنید.');
  await page.locator('[data-report-note]').blur();
  await shot(page, 'report-before-sign');
  await signOff(page, caseId);
  await shot(page, 'report-signed');
  await page.goto(`/#/doctor/case/${caseId}/print?lang=fa`);
  await expect(page.locator('[data-report-items]')).toBeVisible();
  await shot(page, 'print', true);

  // Patient page and the client package.
  await page.goto(`/#/doctor/patient/${patientId}`);
  await page.getByLabel('پاسخ پزشک').fill('سلام، تا دو روز از ورزش سنگین پرهیز کنید.');
  await page.getByRole('button', { name: 'افزودن به بستهٔ بعدی' }).click();
  await shot(page, 'patient');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ارسال پرونده به اپ مراجع' }).last().click();
  const file = await download;
  const pkgPath = `${OUT}/package.json`;
  await file.saveAs(pkgPath);
  expect(readFileSync(pkgPath, 'utf8')).toContain('neva/patient-package');
  await page.goto('/#/doctor');
  await shot(page, 'patients');

  // Client app.
  await page.goto('/#/client');
  await shot(page, 'client-home');
  await page.locator('input[type=file]').setInputFiles(pkgPath);
  await expect(page).toHaveURL(/#\/client\/TN-/);
  await expect(page.getByText('حجم و فرم لب')).toBeVisible();
  await shot(page, 'client-plan');
  await page.getByRole('button', { name: 'عکس‌ها' }).click();
  await expect(page.getByRole('heading', { name: 'شبیه‌سازی تقریبی' })).toBeVisible();
  await shot(page, 'client-photos');
  await page.getByRole('button', { name: 'مراقبت' }).click();
  await shot(page, 'client-care');
  await page.getByRole('button', { name: 'سؤال از پزشک' }).click();
  await page.getByLabel('سؤال خود را بنویسید…').fill('آیا بعد از تزریق می‌توانم آرایش کنم؟');
  await page.getByRole('button', { name: 'ثبت سؤال' }).click();
  await shot(page, 'client-chat');
});
