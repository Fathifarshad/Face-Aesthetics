import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { setupVault, unlockVault } from './helpers';

const shots = 'test-results/screens';

test('home opens in Persian RTL with the black & gold theme', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'نوا' })).toBeVisible();
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(10, 10, 11)');
  await page.screenshot({ path: `${shots}/01-home.png` });
});

const SECTION_TABS = ['پرونده‌ها', 'عکاسی', 'شبیه‌سازی', 'طرح درمان', 'قبل و بعد'];
const tabs = (page: Page) => page.getByRole('navigation', { name: 'بخش‌های اپ' });

for (const width of [360, 390, 430]) {
  test(`doctor frame shows the five sections at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await setupVault(page);
    await expect(tabs(page).getByRole('link')).toHaveText(SECTION_TABS);
    await expect(tabs(page).getByRole('link', { name: 'پرونده‌ها' })).toHaveAttribute('aria-current', 'page');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${shots}/m0-cases-${width}.png` });

    // no case is open yet: a section tab explains what to do instead of failing
    await tabs(page).getByRole('link', { name: 'طرح درمان' }).click();
    await expect(page.getByRole('heading', { name: 'پرونده‌ای باز نیست', level: 2 })).toBeVisible();
    await expect(tabs(page).getByRole('link', { name: 'طرح درمان' })).toHaveAttribute('aria-current', 'page');
    await page.screenshot({ path: `${shots}/m0-no-case-${width}.png` });
  });
}

const PHOTO = 'test-assets/portrait.jpg';

test('doctor flow: patient → intake → photo confirm → analysis → age → plan → sign-off → report', async ({ page }) => {
  test.skip(!existsSync(PHOTO), 'needs a local test photo in test-assets/ (git-ignored)');
  await setupVault(page, '/#/doctor/new');
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
  await expect(page.getByText(/از 7 عکس لازم/).first()).toBeVisible();
  await page.screenshot({ path: `${shots}/03-capture.png` });
  const frontal = page.locator('.card', { hasText: 'روبه‌رو — بی‌حالت' }).first();
  await frontal.locator('input[type=file]').setInputFiles(PHOTO);
  await expect(page.getByRole('dialog', { name: 'تأیید عکس' })).toBeVisible({ timeout: 90_000 });
  await page.screenshot({ path: `${shots}/04-confirm.png`, fullPage: true });
  const accept = page.getByRole('button', { name: /تأیید و ذخیره|استفاده با وجود ایراد/ });
  await accept.click();
  await expect(page.getByText(/1 از 7 عکس لازم/).first()).toBeVisible();

  await page.getByRole('button', { name: 'درجه‌بندی' }).last().click();
  await expect(page).toHaveURL(/grading/);
  await expect(page.getByTestId('reviewed-count')).toBeVisible();
  await page.screenshot({ path: `${shots}/05-grading.png`, fullPage: true });
  await page.goto(page.url().replace(/grading$/, 'analysis'));
  await expect(page).toHaveURL(/analysis/);
  await expect(page.getByRole('heading', { name: 'گودی زیر چشم' })).toBeVisible();
  await page.screenshot({ path: `${shots}/05-analysis.png`, fullPage: true });
  // grade two volume findings
  for (const name of ['افت حجم میانهٔ صورت', 'افتادگی کنار فک (جول)']) {
    const card = page.locator('article', { hasText: name }).first();
    await card.getByRole('button', { name: '3' }).click();
  }
  await page.getByRole('button', { name: 'لب', exact: true }).click();
  const lip = page.locator('article', { hasText: 'حجم و تعریف لب' }).first();
  await lip.getByRole('button', { name: 'ویرایش شدت' }).click();
  await lip.getByRole('button', { name: '2' }).click();

  // M5: age target and simulation; the saved image feeds the report and the client app.
  await page.goto(page.url().replace(/analysis$/, 'simulate'));
  const afterCanvas = page.getByRole('img', { name: 'بعد', exact: true });
  await expect(afterCanvas).toHaveAttribute('data-ready', 'true', { timeout: 90_000 });
  await page.getByRole('button', { name: 'حدود 5 سال جوان‌تر' }).click();
  await page.getByRole('button', { name: 'همه روشن' }).focus();
  await page.keyboard.press('Enter');
  await expect(afterCanvas).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  const saveSim = page.getByRole('button', { name: 'ذخیرهٔ تصویر شبیه‌سازی' });
  await saveSim.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('تصویر شبیه‌سازی با برچسب ذخیره شد.')).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: `${shots}/06-simulate.png`, fullPage: true });

  await page.goto(page.url().replace(/simulate$/, 'plan'));
  await expect(page).toHaveURL(/plan/);
  await expect(page.getByText('زمان‌بندی جلسات')).toBeVisible();
  // Only the two highest-priority findings start expanded; open the lip finding to see its flags.
  const lipPlan = page.getByRole('button', { name: /حجم و تعریف لب/ });
  if ((await lipPlan.getAttribute('aria-expanded')) !== 'true') await lipPlan.click();
  await expect(page.getByText('سابقهٔ تبخال (دور دهان)').first()).toBeVisible();
  await page.screenshot({ path: `${shots}/07-plan.png`, fullPage: true });

  await page.getByRole('link', { name: 'MD Codes', exact: true }).click();
  await expect(page.getByText('دادهٔ دارای مجوز MD Codes نصب نشده است', { exact: false })).toBeVisible();
  await page.screenshot({ path: `${shots}/08-mdcodes.png`, fullPage: true });
  await page.goBack();

  // section tabs lead into the open case
  await tabs(page).getByRole('link', { name: 'قبل و بعد' }).click();
  await expect(page).toHaveURL(/gallery/);
  await expect(page.getByRole('heading', { name: 'گالری قبل و بعد هنوز ساخته نشده است' })).toBeVisible();
  await page.screenshot({ path: `${shots}/m0-gallery.png` });
  await tabs(page).getByRole('link', { name: 'شبیه‌سازی' }).click();
  await expect(page).toHaveURL(/grading/);
  await page.getByRole('navigation', { name: 'گام‌های این بخش' }).getByRole('link', { name: 'شبیه‌سازی' }).click();
  await expect(page).toHaveURL(/simulate/);
  await page.screenshot({ path: `${shots}/m0-simulate.png` });
  await tabs(page).getByRole('link', { name: 'طرح درمان' }).click();
  await expect(page).toHaveURL(/plan/);

  // settings needed for sign-off
  await page.goto('/#/admin');
  await page.getByRole('button', { name: 'پزشک و کلینیک' }).click();
  await page.getByLabel('نام پزشک').fill('دکتر آزمایشی');
  await page.getByLabel('شمارهٔ نظام پزشکی').fill('12345');
  await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات' }).click();
  await expect(page.getByRole('button', { name: 'ذخیره شد' })).toBeVisible();
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

  // A signed case keeps its approved target and simulation image: they go into the client package (M5 review).
  await page.goto(page.url().replace(/report$/, 'simulate'));
  await expect(page.getByText('این پرونده امضا شده است', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'حدود 10 سال جوان‌تر' })).toBeDisabled();
  await expect(page.getByLabel('سن واقعی')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'ذخیرهٔ تصویر شبیه‌سازی' })).toBeDisabled();
  await page.goto(page.url().replace(/simulate$/, 'report'));

  await page.getByRole('link', { name: 'گزارش فارسی (PDF)' }).click();
  await expect(page.getByText('نواحی‌ای که ممکن است از بهبود بهره ببرند')).toBeVisible();
  await page.screenshot({ path: `${shots}/10-print.png`, fullPage: true });

  // persisted after reload; a reload forgets the key, so the passphrase is asked again
  await page.reload();
  await unlockVault(page);
  await expect(page.getByText('نواحی‌ای که ممکن است از بهبود بهره ببرند')).toBeVisible();
});
