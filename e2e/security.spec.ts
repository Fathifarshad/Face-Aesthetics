import { expect, test, type Page } from '@playwright/test';
import { PASSPHRASE, setupVault, signConsent, unlockVault } from './helpers';

/**
 * M2 acceptance (docs/PRD.md §13): photos are ciphertext in IndexedDB, EXIF is dropped on import, the panel
 * locks (button, idle, reload), the recovery code works, and deleting a record leaves nothing behind.
 * All data here is synthetic: a generated picture with a fake EXIF block — no real person, no real location.
 */
const EXIF_SECRET = 'GPS-SECRET-MARKER-00.0000N-00.0000E';
const STORES = ['patients', 'cases', 'photos', 'findings', 'plans', 'simulations', 'signoffs', 'messages', 'audit', 'grades', 'simStates', 'consents'] as const;

/** A JPEG drawn in the page, with an EXIF (APP1) segment spliced in after the start marker. */
async function syntheticJpegWithExif(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 480;
    c.height = 640;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 480, 640);
    g.addColorStop(0, 'gray');
    g.addColorStop(1, 'silver');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 480, 640);
    return c.toDataURL('image/jpeg', 0.9).split(',')[1]!;
  });
  const jpeg = Buffer.from(base64, 'base64');
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from(EXIF_SECRET, 'latin1')]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

/** New patient → intake with the required consents → capture page. */
async function createCaseAtCapture(page: Page) {
  await page.goto('/#/doctor/new');
  await page.getByLabel('نام نمایشی').fill('بیمار ساختگی');
  await page.getByLabel('شمارهٔ پرونده').fill('S-001');
  await page.getByLabel('سال تولد (میلادی)').fill('1985');
  await page.getByRole('button', { name: /^لب ·/ }).click();
  await page.getByRole('button', { name: 'ایجاد و ادامه' }).click();
  await expect(page).toHaveURL(/intake/);
  await signConsent(page, 'analysis');
  await page.getByRole('button', { name: 'عکس‌های مراجع' }).last().click();
  await expect(page).toHaveURL(/capture/);
}

async function saveFrontalPhoto(page: Page, jpeg: Buffer) {
  const slot = page.locator('.card', { hasText: 'روبه‌رو — بی‌حالت' }).first();
  await slot.locator('input[type=file]').setInputFiles({ name: 'synthetic.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(page.getByRole('dialog', { name: 'تأیید عکس' })).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: /تأیید و ذخیره|استفاده با وجود ایراد/ }).click();
  await expect(page.getByText(/1 از \d+ عکس لازم/).first()).toBeVisible();
}

/** Reads the raw IndexedDB rows, bypassing the app: what someone with access to the device storage would see. */
const rawStore = (page: Page, store: string) =>
  page.evaluate(
    (name) =>
      new Promise<{ keys: string[]; sealedHead: number[]; sealedBytes: number[]; iv: number }[]>((resolve, reject) => {
        const open = indexedDB.open('tanasob');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction(name).objectStore(name).getAll();
          req.onerror = () => reject(req.error);
          req.onsuccess = () =>
            resolve(
              (req.result as Record<string, unknown>[]).map((row) => {
                const sealed = (row.sealed ?? row.sealedSignature) as { iv?: Uint8Array; data?: ArrayBuffer } | undefined;
                const bytes = sealed?.data ? Array.from(new Uint8Array(sealed.data)) : [];
                return { keys: Object.keys(row), sealedHead: bytes.slice(0, 3), sealedBytes: bytes, iv: sealed?.iv?.length ?? 0 };
              }),
            );
        };
      }),
    store,
  );

const countStore = (page: Page, store: string) =>
  page.evaluate(
    (name) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('tanasob');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction(name).objectStore(name).count();
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result);
        };
      }),
    store,
  );

const contains = (haystack: number[], needle: string) => Buffer.from(haystack).includes(Buffer.from(needle, 'latin1'));

test('the doctor area asks for a passphrase first and refuses a weak or mistyped one', async ({ page }) => {
  await page.goto('/#/doctor');
  await expect(page.getByRole('heading', { name: 'ساخت رمز پنل پزشک' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'بخش‌های اپ' })).toHaveCount(0);

  await page.getByLabel('رمز عبور', { exact: true }).fill('short');
  await page.getByLabel('تکرار رمز عبور').fill('short');
  await page.getByRole('button', { name: 'ساخت رمز و ادامه' }).click();
  await expect(page.getByText('رمز باید حداقل 8 نویسه باشد.')).toBeVisible();

  await page.getByLabel('رمز عبور', { exact: true }).fill('long-enough-1');
  await page.getByLabel('تکرار رمز عبور').fill('long-enough-2');
  await page.getByRole('button', { name: 'ساخت رمز و ادامه' }).click();
  await expect(page.getByText('دو رمز یکسان نیستند. دوباره وارد کنید.')).toBeVisible();

  const code = await setupVault(page);
  expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{5}-){4}[0-9A-HJKMNP-TV-Z]{5}$/);
  await expect(page.getByRole('navigation', { name: 'بخش‌های اپ' })).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/m2-unlocked.png' });
});

test('a saved photo is ciphertext at rest, loses its EXIF, and opens only with the right passphrase', async ({ page }) => {
  await setupVault(page);
  await createCaseAtCapture(page);
  const jpeg = await syntheticJpegWithExif(page);
  expect(jpeg.includes(Buffer.from(EXIF_SECRET, 'latin1'))).toBe(true);
  await saveFrontalPhoto(page, jpeg);

  // 1) What is on disk: no plain blob, no JPEG header, no trace of the EXIF text.
  const rows = await rawStore(page, 'photos');
  expect(rows).toHaveLength(1);
  expect(rows[0]!.keys).toContain('sealed');
  expect(rows[0]!.keys).not.toContain('blob');
  expect(rows[0]!.iv).toBe(12);
  expect(rows[0]!.sealedBytes.length).toBeGreaterThan(1000);
  expect(rows[0]!.sealedHead).not.toEqual([0xff, 0xd8, 0xff]);
  expect(contains(rows[0]!.sealedBytes, EXIF_SECRET)).toBe(false);
  expect(contains(rows[0]!.sealedBytes, 'Exif')).toBe(false);

  // 2) What the import step produces before encryption: a JPEG without the EXIF block.
  await page.evaluate((bytes) => ((window as unknown as { __jpeg: number[] }).__jpeg = bytes), [...jpeg]);
  const out = (await page.evaluate(`(async () => {
    const { processPhoto } = await import('/src/capture/processPhoto.ts');
    const { viewById } = await import('/src/capture/views.ts');
    const file = new Blob([new Uint8Array(window.__jpeg)], { type: 'image/jpeg' });
    const result = await processPhoto(file, viewById('frontal'));
    return Array.from(new Uint8Array(await result.blob.arrayBuffer()));
  })()`)) as number[];
  expect(out.slice(0, 3)).toEqual([0xff, 0xd8, 0xff]);
  expect(contains(out, EXIF_SECRET)).toBe(false);
  expect(contains(out, 'Exif')).toBe(false);

  // 3) Lock: the photo is gone from the screen; a wrong passphrase does not open it; the right one does.
  const thumbs = page.locator('img[src^="blob:"]');
  await expect(thumbs.first()).toBeVisible();
  await page.goto('/#/doctor');
  await page.getByRole('button', { name: 'قفل کن' }).click();
  await expect(page.getByRole('heading', { name: 'پنل پزشک قفل است' })).toBeVisible();
  await expect(page.locator('img[src^="blob:"]')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/screens/m2-locked.png' });

  await page.getByLabel('رمز عبور', { exact: true }).fill('wrong-passphrase');
  await page.getByRole('button', { name: 'باز کردن قفل' }).click();
  await expect(page.getByText('رمز درست نیست. دوباره وارد کنید.')).toBeVisible({ timeout: 30_000 });
  await unlockVault(page);

  await page.goBack();
  await expect(page).toHaveURL(/capture/);
  await expect(thumbs.first()).toBeVisible();
  expect(await thumbs.first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // 4) A reload forgets the key as well.
  await page.reload();
  await unlockVault(page);
  await expect(thumbs.first()).toBeVisible();
});

test('the panel locks itself after 5 minutes without activity, and activity postpones it', async ({ page }) => {
  await page.clock.install();
  await setupVault(page);
  const locked = page.getByRole('heading', { name: 'پنل پزشک قفل است' });

  await page.clock.fastForward('04:00');
  await expect(locked).toBeHidden();
  await page.getByRole('heading', { name: 'بیماران' }).click();
  await page.clock.fastForward('04:00');
  await expect(locked).toBeHidden();

  await page.clock.fastForward('05:30');
  await expect(locked).toBeVisible();
});

test('the passphrase can be changed, and the recovery code resets it and is replaced', async ({ page }) => {
  const code = await setupVault(page);
  await createCaseAtCapture(page);
  const captureRoute = new URL(page.url()).hash;
  await saveFrontalPhoto(page, await syntheticJpegWithExif(page));

  // Change the passphrase in the admin panel.
  await page.goto('/#/admin');
  await expect(page.getByRole('heading', { name: 'پنل مدیریت' })).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/m2-admin-security.png', fullPage: true });
  const changeForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'تغییر رمز', exact: true }) });
  await changeForm.getByLabel('رمز عبور فعلی').fill('not-the-passphrase');
  await changeForm.getByLabel('رمز عبور جدید', { exact: true }).fill('second-passphrase-2');
  await changeForm.getByLabel('تکرار رمز عبور جدید').fill('second-passphrase-2');
  await changeForm.getByRole('button', { name: 'تغییر رمز', exact: true }).click();
  await expect(changeForm.getByText('رمز درست نیست. دوباره وارد کنید.')).toBeVisible({ timeout: 30_000 });
  await changeForm.getByLabel('رمز عبور فعلی').fill(PASSPHRASE);
  await changeForm.getByRole('button', { name: 'تغییر رمز', exact: true }).click();
  await expect(changeForm.getByText('رمز عبور تغییر کرد.')).toBeVisible({ timeout: 30_000 });

  // The old passphrase no longer opens the panel.
  await page.getByRole('button', { name: 'قفل کن' }).click();
  await page.getByLabel('رمز عبور', { exact: true }).fill(PASSPHRASE);
  await page.getByRole('button', { name: 'باز کردن قفل' }).click();
  await expect(page.getByText('رمز درست نیست. دوباره وارد کنید.')).toBeVisible({ timeout: 30_000 });

  // Forgotten passphrase: a wrong code is refused, the real one sets a new passphrase and a new code.
  await page.getByRole('button', { name: 'رمز را فراموش کرده‌ام' }).click();
  await page.getByLabel('کد بازیابی').fill('AAAAA-AAAAA-AAAAA-AAAAA-AAAAA');
  await page.getByLabel('رمز عبور جدید', { exact: true }).fill('third-passphrase-3');
  await page.getByLabel('تکرار رمز عبور جدید').fill('third-passphrase-3');
  await page.getByRole('button', { name: 'بازیابی و ساخت رمز جدید' }).click();
  await expect(page.getByText(/کد بازیابی درست نیست/)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('کد بازیابی').fill(code.toLowerCase().replace(/-/g, ' '));
  await page.getByRole('button', { name: 'بازیابی و ساخت رمز جدید' }).click();
  await expect(page.getByRole('heading', { name: 'کد بازیابی را یادداشت کنید' })).toBeVisible({ timeout: 30_000 });
  const nextCode = (await page.getByLabel('کد بازیابی').textContent())!.trim();
  expect(nextCode).not.toBe(code);
  await page.getByLabel('کد را یادداشت کردم').check();
  await page.getByRole('button', { name: 'ورود به پنل پزشک' }).click();

  // The photo saved before all of this still opens: the image key never changed.
  await page.goto(`/${captureRoute}`);
  await expect(page).toHaveURL(/capture/);
  const thumb = page.locator('img[src^="blob:"]').first();
  await expect(thumb).toBeVisible();
  expect(await thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // The new passphrase works after a lock; the used recovery code does not.
  await page.goto('/#/doctor');
  await page.getByRole('button', { name: 'قفل کن' }).click();
  await page.getByRole('button', { name: 'رمز را فراموش کرده‌ام' }).click();
  await page.getByLabel('کد بازیابی').fill(code);
  await page.getByLabel('رمز عبور جدید', { exact: true }).fill('fourth-passphrase-4');
  await page.getByLabel('تکرار رمز عبور جدید').fill('fourth-passphrase-4');
  await page.getByRole('button', { name: 'بازیابی و ساخت رمز جدید' }).click();
  await expect(page.getByText(/کد بازیابی درست نیست/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'بازگشت به ورود با رمز' }).click();
  await unlockVault(page, 'third-passphrase-3');
});

test('deleting a patient leaves nothing about them on the device', async ({ page }) => {
  await setupVault(page);
  await createCaseAtCapture(page);
  await saveFrontalPhoto(page, await syntheticJpegWithExif(page));
  await page.getByRole('button', { name: 'درجه‌بندی' }).last().click();
  await expect(page).toHaveURL(/grading/);
  // A manual grade (M5) and a simulation state, so those stores hold something too.
  await page.locator('li', { has: page.getByRole('heading', { name: 'حجم و فرم لب', exact: true }) }).getByRole('radio', { name: '2' }).click();
  await expect(page.getByText('ویرایش‌شده').first()).toBeVisible();
  await page.goto(page.url().replace(/grading$/, 'simulate'));
  await page.getByRole('button', { name: 'حدود 5 سال جوان‌تر' }).click();
  await expect(page.getByTestId('target-age')).toBeVisible();
  await page.goto(page.url().replace(/simulate$/, 'analysis'));
  await expect(page.getByRole('heading', { name: 'گودی زیر چشم' })).toBeVisible();

  for (const store of ['patients', 'cases', 'photos', 'findings', 'audit', 'grades', 'simStates', 'consents'])
    expect(await countStore(page, store), store).toBeGreaterThan(0);

  await page.goto('/#/doctor');
  await page.getByRole('link', { name: /بیمار ساختگی/ }).click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'حذف کامل بیمار' }).click();
  await expect(page).toHaveURL(/#\/doctor$/);
  await expect(page.getByText('هنوز پرونده‌ای ثبت نشده است.')).toBeVisible();

  for (const store of STORES) expect(await countStore(page, store), store).toBe(0);
});
