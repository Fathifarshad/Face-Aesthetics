import { expect, test, type Download, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { newCaseWithFrontal, setupVault, signConsent, signOff, watchNetwork } from './helpers';

/**
 * M11 acceptance (docs/PRD.md §13): package round trip doctor → client → doctor → client without duplicate messages;
 * nothing from F10.6 in the package; no before/after photo without consent (revocation removes them from the phone).
 * Doctor and client share one browser here: they use separate tables. Synthetic data; the photo is a local test asset.
 */
const PHOTO = 'test-assets/portrait.jpg';
const OUT = 'test-results/client';

/** F10.6 items, searched in the whole package text (photos removed: base64 can contain anything). */
function forbidden(json: string): string[] {
  const pkg = JSON.parse(json) as { photos: { dataUrl: string }[] };
  const text = JSON.stringify({ ...pkg, photos: pkg.photos.map(() => '') });
  const hits: string[] = [];
  const checks: [string, RegExp][] = [
    ['grade', /severity|grade|درجه/i],
    ['volume or dose', /\bmL\b|\d\s*U\b|estimate|واحد|میلی‌لیتر/],
    ['MD Codes', /mdCodes|\b(Ck|Jw|NL|Lp|Tt|T|C|M|E|F|G|O|N)\d\b|MD Codes/],
    ['screening', /screen|block|غربالگری/i],
    ['cost', /cost|tariff|price|هزینه|ریال|تومان/i],
  ];
  for (const [name, re] of checks) if (re.test(text)) hits.push(`${name}: ${re.exec(text)![0]}`);
  return hits;
}

const save = async (d: Promise<Download>, name: string) => {
  const file = await d;
  const path = `${OUT}/${name}`;
  await file.saveAs(path);
  return { path, name: file.suggestedFilename(), text: readFileSync(path, 'utf8') };
};

async function exportPackage(page: Page, patientId: string, name: string) {
  await page.goto(`/#/doctor/patient/${patientId}`);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ارسال پرونده به اپ مراجع' }).last().click();
  return save(download, name);
}

async function importIntoClientApp(page: Page, path: string) {
  await page.goto('/#/client');
  await page.locator('input[type=file]').setInputFiles(path);
}

test('client package round trip, F10.6 and consent', async ({ page }) => {
  test.skip(!existsSync(PHOTO), 'needs a local test photo in test-assets/ (git-ignored)');
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  // No system share sheet in tests: files are downloaded.
  await page.addInitScript(() => Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }));
  const offending = watchNetwork(page);
  await setupVault(page);
  const caseId = await newCaseWithFrontal(page, PHOTO);

  // Signing needs the doctor's profile.
  await page.goto('/#/admin');
  await page.getByRole('button', { name: 'پزشک و کلینیک' }).click();
  await page.getByLabel('نام پزشک').fill('دکتر آزمایشی');
  await page.getByLabel('شمارهٔ نظام پزشکی').fill('12345');
  await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات' }).click();
  await expect(page.getByRole('button', { name: 'ذخیره شد' })).toBeVisible();

  // Client app on for this case; the patient id from the intake page.
  await page.goto(`/#/doctor/case/${caseId}/intake`);
  await page.getByRole('switch', { name: 'ارسال پرونده به اپ مراجع' }).click();
  await expect(page.getByRole('switch', { name: 'ارسال پرونده به اپ مراجع' })).toHaveAttribute('aria-checked', 'true');
  const patientId = /patient\/([^/?#]+)/.exec((await page.locator('a[href*="/doctor/patient/"]').first().getAttribute('href'))!)![1]!;

  await page.goto(`/#/doctor/case/${caseId}/gallery`);
  await signConsent(page, 'beforeAfter', 'فقط داخلی', true);

  // Lips grade 3 (default option: lip filler, which has a volume range and MD Codes), saved simulation, note, sign-off.
  await page.goto(`/#/doctor/case/${caseId}/grading`);
  await expect(page.getByRole('button', { name: 'اندازه‌گیری دوباره' })).toBeEnabled({ timeout: 90_000 });
  const lips = page.locator('li', { has: page.getByRole('heading', { name: 'حجم و فرم لب', exact: true }) });
  await lips.getByRole('radio', { name: '3' }).click();
  await expect(lips.getByText('ویرایش‌شده')).toBeVisible();
  await page.goto(`/#/doctor/case/${caseId}/simulate`);
  await expect(page.getByRole('img', { name: 'بعد', exact: true })).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await page.getByRole('button', { name: 'ذخیرهٔ تصویر شبیه‌سازی' }).click();
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 30_000 });
  await page.goto(`/#/doctor/case/${caseId}/report`);
  await page.locator('[data-report-note]').fill('یادداشت آزمایشی پزشک');
  await page.locator('[data-report-note]').blur();
  await signOff(page, caseId);

  // Doctor → client, first package.
  await page.goto(`/#/doctor/patient/${patientId}`);
  await page.getByLabel('پاسخ پزشک').fill('پاسخ آزمایشی پزشک');
  await page.getByRole('button', { name: 'افزودن به بستهٔ بعدی' }).click();
  const pkg1 = await exportPackage(page, patientId, 'package-1.json');
  expect(pkg1.name).toMatch(/^neva-TN-.+\.json$/);
  const p1 = JSON.parse(pkg1.text) as { format: string; version: number; cases: unknown[]; photos: { phase: string }[] };
  expect(p1.format).toBe('neva/patient-package');
  expect(p1.version).toBe(2);
  expect(p1.cases).toHaveLength(1);
  expect(p1.photos.map((p) => p.phase).sort()).toEqual(['before', 'simulation']);
  expect(forbidden(pkg1.text)).toEqual([]);

  await importIntoClientApp(page, pkg1.path);
  await expect(page).toHaveURL(/#\/client\/TN-/);
  const clientUrl = page.url();
  await expect(page.getByText('حجم و فرم لب')).toBeVisible();
  await expect(page.getByText('پُری و فرم لب‌ها')).toBeVisible();
  await expect(page.getByText(/درمان انتخاب‌شده: فیلر HA/)).toBeVisible();
  await expect(page.getByText('یادداشت آزمایشی پزشک')).toBeVisible();
  await page.screenshot({ path: `${OUT}/client-plan.png`, fullPage: true });
  await page.getByRole('button', { name: 'عکس‌ها' }).click();
  await expect(page.getByRole('heading', { name: 'شبیه‌سازی تقریبی' })).toBeVisible();
  await page.screenshot({ path: `${OUT}/client-photos.png`, fullPage: true });

  // Client → doctor: one question, sent twice (the reply file is imported twice).
  await page.getByRole('button', { name: 'سؤال از پزشک' }).click();
  await expect(page.getByText('پاسخ آزمایشی پزشک')).toHaveCount(1);
  await page.getByLabel('سؤال خود را بنویسید…').fill('سؤال آزمایشی مراجع');
  await page.getByRole('button', { name: 'ثبت سؤال' }).click();
  const replyDl = page.waitForEvent('download');
  await page.getByRole('button', { name: /ارسال سؤال‌ها و عکس‌ها به کلینیک/ }).click();
  const reply = await save(replyDl, 'reply-1.json');
  expect(reply.name).toMatch(/^neva-reply-TN-.+\.json$/);
  expect(JSON.parse(reply.text)).toMatchObject({ format: 'neva/patient-reply', version: 2 });

  for (let i = 0; i < 2; i++) {
    await page.goto('/#/doctor');
    await page.locator('input[type=file]').setInputFiles(reply.path);
    await expect(page).toHaveURL(new RegExp(`patient/${patientId}$`));
  }
  await expect(page.getByText('سؤال آزمایشی مراجع')).toHaveCount(1);
  await expect(page.getByText('پاسخ آزمایشی پزشک')).toHaveCount(1);

  // Doctor → client again: each message once on the phone.
  const pkg2 = await exportPackage(page, patientId, 'package-2.json');
  await importIntoClientApp(page, pkg2.path);
  await page.getByRole('button', { name: 'سؤال از پزشک' }).click();
  await expect(page.getByText('سؤال آزمایشی مراجع')).toHaveCount(1);
  await expect(page.getByText('پاسخ آزمایشی پزشک')).toHaveCount(1);
  await page.screenshot({ path: `${OUT}/client-chat.png`, fullPage: true });

  // Revocation (F10.4): the next package has no photo and the phone drops the clinic photos.
  await page.goto(`/#/doctor/case/${caseId}/gallery`);
  const card = page.locator('[data-consent="beforeAfter"]');
  await card.getByRole('button', { name: 'پس گرفتن رضایت' }).click();
  await card.getByRole('button', { name: 'بله، پس گرفته شود' }).click();
  await expect(card).toHaveAttribute('data-state', 'none');
  const pkg3 = await exportPackage(page, patientId, 'package-3.json');
  expect((JSON.parse(pkg3.text) as { photos: unknown[] }).photos).toHaveLength(0);
  expect(forbidden(pkg3.text)).toEqual([]);
  await importIntoClientApp(page, pkg3.path);
  await page.getByRole('button', { name: 'عکس‌ها' }).click();
  await expect(page.getByText('عکس‌های قبل و بعد فقط با رضایت ثبت‌شدهٔ شما')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'شبیه‌سازی تقریبی' })).toHaveCount(0);

  // An older clinic file cannot bring the photos back.
  await importIntoClientApp(page, pkg1.path);
  await expect(page.getByText('این فایل قدیمی‌تر از پروندهٔ روی گوشی است و وارد نشد.')).toBeVisible();
  await page.goto(clientUrl);
  await page.getByRole('button', { name: 'عکس‌ها' }).click();
  await expect(page.getByRole('heading', { name: 'شبیه‌سازی تقریبی' })).toHaveCount(0);

  expect(offending).toEqual([]);
});
