import { expect, test } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * M1 evidence: runs the region debug layer on every local test photo and saves the annotated images for
 * review by eye. Photos live in test-assets/ and results in test-results/ — both git-ignored, never committed.
 * Per photo: <name>-regions.jpg (the concern regions, zoomed on the face), <name>-skin.jpg (the skin region only),
 * <name>-protect.jpg (protected regions, anchor points and face axes), <name>.txt (region count and head pose).
 */
const ASSETS = 'test-assets';
const OUT = 'test-results/regions';
const photos = existsSync(ASSETS) ? readdirSync(ASSETS).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort() : [];
const CANVAS = 'نواحی موتور تصویر روی چهره';

test.describe('region debug layer', () => {
  test.skip(photos.length === 0, 'needs local test photos in test-assets/ (git-ignored)');

  for (const width of [360, 390, 430]) {
    test(`fits a ${width}px screen with a photo loaded`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/#/dev/regions');
      await page.getByLabel('بارگذاری عکس').setInputFiles(join(ASSETS, photos[0]!));
      await expect(page.getByRole('img', { name: CANVAS })).toHaveAttribute('data-ready', 'true', { timeout: 90_000 });
      await expect(page.getByRole('button', { name: /خطوط پیشانی/ })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      // The photo stays on screen while the list below it is scrolled, so regions can be switched while watching them.
      await page.getByRole('button', { name: /کیفیت و بافت پوست/ }).scrollIntoViewIfNeeded();
      await expect(page.getByRole('img', { name: CANVAS })).toBeInViewport();
      mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: join(OUT, `page-${width}.png`) });
    });
  }

  test('on a wide screen the region list sits beside the photo', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/#/dev/regions');
    await page.getByLabel('بارگذاری عکس').setInputFiles(join(ASSETS, photos[0]!));
    const canvas = page.getByRole('img', { name: CANVAS });
    await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 90_000 });
    const photo = (await canvas.boundingBox())!;
    const first = (await page.getByRole('button', { name: /خطوط پیشانی/ }).boundingBox())!;
    const last = page.getByRole('button', { name: /کیفیت و بافت پوست/ });
    // Side by side: the list starts within the height of the photo, not under it, and does not overlap it.
    expect(first.y).toBeLessThan(photo.y + photo.height);
    expect(first.x + first.width <= photo.x + 1 || first.x >= photo.x + photo.width - 1).toBe(true);
    await last.scrollIntoViewIfNeeded();
    await expect(canvas).toBeInViewport();
    await expect(last).toBeInViewport();
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: join(OUT, 'page-wide.png') });
  });

  for (const name of photos) {
    test(`places the regions on ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto('/#/dev/regions');
      await page.getByLabel('بارگذاری عکس').setInputFiles(join(ASSETS, name));
      const canvas = page.getByRole('img', { name: CANVAS });
      await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 90_000 });

      // The canvas is zoomed on the face by default; export it at its own resolution.
      const grab = () =>
        canvas.evaluate((c: HTMLCanvasElement) => ({
          regions: Number(c.dataset.regions),
          hairline: c.dataset.hairline ?? '',
          pose: c.dataset.pose ?? '',
          jpg: c.toDataURL('image/jpeg', 0.92),
        }));
      const bytes = (dataUrl: string) => Buffer.from(dataUrl.split(',')[1]!, 'base64');

      const info = await grab();
      mkdirSync(OUT, { recursive: true });
      const stem = name.replace(/\.[^.]+$/, '');
      writeFileSync(join(OUT, `${stem}-regions.jpg`), bytes(info.jpg));
      writeFileSync(join(OUT, `${stem}.txt`), `regions=${info.regions} hairline=${info.hairline} pose(yaw,pitch,roll)=${info.pose}\n`);

      // 16 concerns give 25 regions with the neck (24 without) plus 4 protected-only regions,
      // or none at all when no face is found — in that case the page must say so.
      if (info.regions === 0) {
        await expect(page.getByText(/چهره‌ای در عکس پیدا نشد|بیش از یک چهره/)).toBeVisible();
      } else {
        expect([28, 29]).toContain(info.regions);
        // Second image: the whole-face skin region alone.
        await page.getByRole('button', { name: 'نمایش همه' }).click();
        await page.getByRole('button', { name: 'پنهان کردن همه' }).click();
        await page.getByRole('button', { name: /کیفیت و بافت پوست/ }).click();
        writeFileSync(join(OUT, `${stem}-skin.jpg`), bytes((await grab()).jpg));
        // Third image: only the protected regions, the anchor points and the face axes.
        await page.getByRole('button', { name: 'نواحی', exact: true }).click();
        for (const layer of ['نواحی محافظ', 'نقاط لنگر', 'محورهای چهره']) await page.getByRole('button', { name: layer }).click();
        writeFileSync(join(OUT, `${stem}-protect.jpg`), bytes((await grab()).jpg));
      }
      expect(errors).toEqual([]);
    });
  }
});
