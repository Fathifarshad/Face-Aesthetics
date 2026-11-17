import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { newCaseWithFrontal, setupVault } from './helpers';

/**
 * M5: grading and age target. For every local frontal photo the automatic indices and grades are written to
 * test-results/grading/<photo>.txt (used to set the draft thresholds); the page checks run on the first photo.
 * Photos live in test-assets/ (git-ignored, never committed).
 */
const ASSETS = 'test-assets';
const OUT = 'test-results/grading';
const FRONTAL = ['20261112_230515.jpg', '20261114_001811.jpg', '20261114_001749.jpg', '20261114_001802.jpg', '20261114_001815.jpg', 'portrait.jpg'].filter((f) =>
  existsSync(join(ASSETS, f)),
);

type Row = { concernId: string; side: string; index: number | null; autoGrade: number | null; confidence: string | null; grade: number; reviewed: string };

/** Grade rows of the case, read straight from IndexedDB (they hold no image data). */
const gradeRows = (page: Page, caseId: string) =>
  page.evaluate(
    (id) =>
      new Promise<Row[]>((resolve, reject) => {
        const open = indexedDB.open('tanasob');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('grades').objectStore('grades').index('caseId').getAll(id);
          req.onsuccess = () => resolve(req.result as Row[]);
          req.onerror = () => reject(req.error);
        };
      }),
    caseId,
  );

async function measured(page: Page, caseId: string): Promise<Row[]> {
  await page.goto(`/#/doctor/case/${caseId}/grading`);
  await expect(page.getByRole('heading', { name: /^درجه‌بندی/ })).toBeVisible();
  await expect.poll(async () => (await gradeRows(page, caseId)).length, { timeout: 90_000 }).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'اندازه‌گیری دوباره' })).toBeEnabled({ timeout: 60_000 });
  return gradeRows(page, caseId);
}

test.describe('grading and age target', () => {
  test.skip(FRONTAL.length === 0, 'needs a frontal photo in test-assets/');
  test.setTimeout(240_000);

  for (const photo of FRONTAL) {
    test(`indices on ${photo}`, async ({ page }) => {
      await setupVault(page);
      const caseId = await newCaseWithFrontal(page, join(ASSETS, photo));
      const rows = await measured(page, caseId);
      expect(rows.length).toBe(9 + 4); // 9 auto-graded concerns, 4 of them with two sides
      mkdirSync(OUT, { recursive: true });
      const lines = rows
        .sort((a, b) => a.concernId.localeCompare(b.concernId) || a.side.localeCompare(b.side))
        .map((r) => `${r.concernId.padEnd(16)} ${r.side.padEnd(4)} index ${r.index!.toFixed(2).padStart(6)}  grade ${r.autoGrade}  ${r.confidence}`);
      writeFileSync(join(OUT, `${photo}.txt`), lines.join('\n') + '\n');
      await page.screenshot({ path: join(OUT, `${photo}-page.png`), fullPage: true });
    });
  }

  test('review grades, then the age target drives the sliders and leaves moved ones alone', async ({ page }) => {
    await setupVault(page);
    const caseId = await newCaseWithFrontal(page, join(ASSETS, FRONTAL[0]!));
    await measured(page, caseId);

    // Manual concern: the doctor sets the grade; neck: rejected; nasolabial: grade 4 on both sides.
    const card = (name: string) => page.locator('li', { has: page.getByRole('heading', { name, exact: true }) });
    await card('حجم و فرم لب').getByRole('radio', { name: '3' }).click();
    await expect(card('حجم و فرم لب').getByText('ویرایش‌شده')).toBeVisible();
    await card('گردن').getByRole('button', { name: /^رد/ }).click();
    await expect(card('گردن').getByText('ردشده')).toBeVisible();
    for (const g of await card('چین نازولبیال (خط خنده)').getByRole('radiogroup').all()) await g.getByRole('radio', { name: '4' }).click();
    await expect(card('چین نازولبیال (خط خنده)').getByText(/تأییدشده|ویرایش‌شده/)).toBeVisible();

    await page.getByRole('button', { name: 'رفتن به شبیه‌سازی' }).click();
    await expect(page).toHaveURL(/simulate/);
    const after = page.getByRole('img', { name: 'بعد', exact: true });
    await expect(after).toHaveAttribute('data-ready', 'true', { timeout: 90_000 });

    // Birth year 1980 → real age = this year − 1980. Target "same age" first.
    const real = new Date().getFullYear() - 1980;
    await page.getByRole('button', { name: 'بهترین حالت همین سن' }).click();
    await expect(page.getByTestId('target-age')).toContainText(String(real));
    const nl = page.getByRole('slider', { name: 'شدت چین نازولبیال (خط خنده)' });
    const lips = page.getByRole('slider', { name: 'شدت حجم و فرم لب' });
    const neck = page.getByRole('switch', { name: 'گردن' });
    await expect(neck).toHaveAttribute('aria-checked', 'false');
    const nlSame = Number(await nl.inputValue());
    const lipsSame = Number(await lips.inputValue());
    expect(nlSame).toBeGreaterThan(0);

    // Move the lips by hand, then go 10 years younger: nasolabial rises, the lips stay where they were put.
    await lips.fill('20');
    await expect(page.locator('#change-lip-volume')).toHaveAttribute('data-manual', 'true');
    await page.getByRole('button', { name: 'حدود 10 سال جوان‌تر' }).click();
    await expect(page.getByTestId('target-age')).toContainText(String(real - 10));
    await expect.poll(async () => Number(await nl.inputValue())).toBeGreaterThan(nlSame);
    expect(Number(await lips.inputValue())).toBe(20);
    expect(lipsSame).not.toBe(20);

    // Custom age.
    await page.getByRole('button', { name: 'سن دلخواه' }).click();
    await page.getByLabel('سن هدف تقریبی').fill(String(real - 3));
    await expect(page.getByTestId('target-age')).toContainText(String(real - 3));

    // Back to defaults: the lips follow their grade again; the settings survive a reload.
    await page.getByRole('button', { name: 'بازگشت به پیش‌فرض' }).click();
    await expect(page.locator('#change-lip-volume')).not.toHaveAttribute('data-manual', 'true');
    await expect.poll(async () => Number(await lips.inputValue())).not.toBe(20);

    // Save the simulation image (for the report and the client app).
    await expect(after).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
    await page.getByRole('button', { name: 'ذخیرهٔ تصویر شبیه‌سازی' }).click();
    await expect(page.getByText('تصویر شبیه‌سازی با برچسب ذخیره شد.')).toBeVisible({ timeout: 30_000 });

    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `no horizontal scroll at ${width}`).toBe(true);
      mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: join(OUT, `simulate-${width}.png`) });
    }
    // M6: the plan page lists the confirmed concerns with their options; the choice drives the simulation.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/#/doctor/case/${caseId}/plan`);
    const lipCard = page.locator('article[data-concern="lip-volume"]');
    await expect(lipCard).toBeVisible();
    await expect(page.locator('article[data-concern="neck"]')).toHaveCount(0);
    // Clinical sign-off 2026-11-17: no «تأییدنشده» badge; the plan names the reviewing physicians.
    await expect(lipCard.getByText('تأییدنشده')).toHaveCount(0);
    await expect(page.locator('[data-clinical-review]')).toContainText('دکتر فرشاد فتحی و دکتر نغمه نوری');
    const nlCard = page.locator('article[data-concern="nasolabial-fold"]');
    const names = async () => nlCard.locator('[data-option] button[role=radio] span.font-semibold').allTextContents();
    expect((await names())[0]).toBe('فیلر مستقیم'); // midface not graded: no cheek support first (F5.6)
    await page.getByRole('button', { name: 'نقاهت کمتر' }).click();
    await expect.poll(names).not.toEqual(['فیلر مستقیم', 'نخ', 'حمایت گونه']);
    await expect(page.getByText('ترتیب جلسات')).toBeVisible();
    await lipCard.getByRole('radio', { name: 'لیپ‌فلیپ با توکسین برای حجم و فرم لب' }).click();
    await expect(lipCard.getByRole('radio', { name: 'لیپ‌فلیپ با توکسین برای حجم و فرم لب' })).toHaveAttribute('aria-checked', 'true');

    // M7: estimates. No toxin number until the brand is OnabotulinumtoxinA (PRD §7.1); filler in mL.
    const flip = lipCard.locator('[data-option="lip-volume.2.toxin"]');
    await expect(flip.locator('[data-estimate]')).toHaveAttribute('data-estimate', 'brand');
    await expect(lipCard.locator('[data-option="lip-volume.1.filler"] [data-estimate]')).toHaveAttribute('data-estimate', /^\d+(\.\d)?-\d+(\.\d)?$/);
    await page.getByRole('radio', { name: 'OnabotulinumtoxinA' }).click();
    await expect(flip.locator('[data-estimate]')).toHaveAttribute('data-estimate', /^\d+-\d+$/);
    await expect(page.locator('[data-total="toxin"]')).toContainText('ویال');
    await expect(page.locator('[data-total="filler"]')).toContainText('سرنگ');
    // The doctor's own estimate (F7.5).
    await flip.getByRole('button', { name: /^ویرایش پزشک/ }).click();
    const form = flip.locator('[data-override-form]');
    await form.getByLabel(/کمینه/).fill('6');
    await form.getByLabel(/بیشینه/).fill('4');
    await form.getByRole('button', { name: 'ذخیره' }).click();
    await expect(form.getByText('بازه درست نیست', { exact: false })).toBeVisible();
    await form.getByLabel(/بیشینه/).fill('8');
    await form.getByRole('button', { name: 'ذخیره' }).click();
    await expect(flip.locator('[data-estimate]')).toHaveAttribute('data-estimate', '6-8');
    await expect(flip.getByText('ویرایش پزشک').first()).toBeVisible();
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: join(OUT, 'plan-390.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('link', { name: 'دیدن شبیه‌سازی' }).click();
    await expect(page.locator('#change-lip-volume [data-option]')).toHaveAttribute('data-option', /lip-volume\.2\.toxin/);

    await page.goto(`/#/doctor/case/${caseId}/grading`);
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `no horizontal scroll at ${width}`).toBe(true);
      await page.screenshot({ path: join(OUT, `grading-${width}.png`) });
    }
  });
});
