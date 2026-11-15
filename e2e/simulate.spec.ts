import { expect, test, type Locator, type Page } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { newCaseWithFrontal, setupVault } from './helpers';

/**
 * M3 evidence for the simulation page: for every local frontal photo it saves before/after images at the
 * start strength and at the cap, an amplified difference map, and the render times measured in the worker.
 * Photos live in test-assets/ and results in test-results/simulate/ — both git-ignored, never committed.
 */
const ASSETS = 'test-assets';
const OUT = 'test-results/simulate';
/** Frontal, neutral or nearly so (see docs/TASKS.md, M1). The first one that exists is used for the page checks. */
const FRONTAL = ['20261112_230515.jpg', '20261114_001811.jpg', '20261114_001749.jpg', 'portrait.jpg'].filter((f) => existsSync(join(ASSETS, f)));

const after = (page: Page) => page.getByRole('img', { name: 'بعد', exact: true });
const before = (page: Page) => page.getByRole('img', { name: 'قبل', exact: true });

/** Waits until the newest frame is on the "after" canvas and returns its render time in ms. */
async function settled(page: Page): Promise<number> {
  await expect(after(page)).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  return Number(await after(page).getAttribute('data-render-ms'));
}

const jpg = (c: Locator) => c.evaluate((el: HTMLCanvasElement) => el.toDataURL('image/jpeg', 0.92));
const bytes = (dataUrl: string) => Buffer.from(dataUrl.split(',')[1]!, 'base64');

/** Side by side before | after and a difference map (x8) of the two canvases, rendered in the page. */
function sheets(page: Page) {
  return page.evaluate(() => {
    const [b, a] = ['قبل', 'بعد'].map((n) => document.querySelector<HTMLCanvasElement>(`canvas[aria-label="${n}"]`)!);
    const w = b!.width;
    const h = b!.height;
    const pair = document.createElement('canvas');
    pair.width = w * 2 + 8;
    pair.height = h;
    const p = pair.getContext('2d')!;
    p.drawImage(b!, 0, 0);
    p.drawImage(a!, w + 8, 0);
    const pb = b!.getContext('2d')!.getImageData(0, 0, w, h).data;
    const pa = a!.getContext('2d')!.getImageData(0, 0, w, h).data;
    const diff = document.createElement('canvas');
    diff.width = w;
    diff.height = h;
    const d = diff.getContext('2d')!;
    const img = d.createImageData(w, h);
    let sum = 0;
    let changed = 0;
    for (let i = 0; i < pb.length; i += 4) {
      const delta = (Math.abs(pa[i]! - pb[i]!) + Math.abs(pa[i + 1]! - pb[i + 1]!) + Math.abs(pa[i + 2]! - pb[i + 2]!)) / 3;
      sum += delta;
      if (delta >= 2) changed++;
      const v = Math.min(255, delta * 8);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    d.putImageData(img, 0, 0);
    return { pair: pair.toDataURL('image/jpeg', 0.92), diff: diff.toDataURL('image/jpeg', 0.9), mean: sum / (w * h), changed: changed / (w * h) };
  });
}

/** Largest channel difference between the two canvases above the burned-in label bar. */
function differenceAboveLabel(page: Page) {
  return page.evaluate(() => {
    const [b, a] = ['قبل', 'بعد'].map((n) => document.querySelector<HTMLCanvasElement>(`canvas[aria-label="${n}"]`)!);
    const w = b!.width;
    const bar = Math.round(Math.max(11, Math.round((w * 11) / 390)) * 2.2);
    const h = b!.height - bar - 1;
    const pb = b!.getContext('2d')!.getImageData(0, 0, w, h).data;
    const pa = a!.getContext('2d')!.getImageData(0, 0, w, h).data;
    let max = 0;
    for (let i = 0; i < pb.length; i++) if (i % 4 !== 3) max = Math.max(max, Math.abs(pa[i]! - pb[i]!));
    return max;
  });
}

async function openSimulation(page: Page, photo: string) {
  await setupVault(page);
  const caseId = await newCaseWithFrontal(page, join(ASSETS, photo));
  await page.goto(`/#/doctor/case/${caseId}/simulate`);
  await settled(page);
}

test.describe('simulation page', () => {
  test.skip(FRONTAL.length === 0, 'needs a local frontal test photo in test-assets/ (git-ignored)');

  test('switches, sliders, all off, and the compare divider', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await openSimulation(page, FRONTAL[0]!);

    // One switch and one slider per region with a smoothing effect; skin and neck start off.
    await expect(page.getByRole('switch', { name: 'خطوط پیشانی' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('switch', { name: 'کیفیت و بافت پوست' })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('slider', { name: 'شدت خطوط پیشانی' })).toHaveAttribute('max', '85');
    expect(await differenceAboveLabel(page)).toBeGreaterThan(0);

    // Everything off: "after" equals "before" except for the label (zero strength returns the input).
    await page.getByRole('button', { name: 'همه خاموش' }).click();
    await settled(page);
    expect(await differenceAboveLabel(page)).toBe(0);
    await page.getByRole('button', { name: 'همه روشن' }).click();
    await settled(page);

    // The simulation label bar darkens the bottom of the "after" canvas.
    const bottom = await after(page).evaluate((c: HTMLCanvasElement) => {
      const row = c.getContext('2d')!.getImageData(0, c.height - 2, c.width, 1).data;
      let s = 0;
      for (let i = 0; i < row.length; i += 4) s += row[i]! + row[i + 1]! + row[i + 2]!;
      return s / (row.length / 4) / 3;
    });
    expect(bottom).toBeLessThan(120);

    // The compare slider moves the divider.
    await page.getByRole('slider', { name: 'جابه‌جایی خط مقایسهٔ قبل و بعد' }).fill('20');
    await expect(after(page)).toHaveAttribute('style', /inset\(0px 0px 0px 20%\)/);

    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: join(OUT, `page-${width}.png`) });
    }
    expect(errors).toEqual([]);
  });

  for (const photo of FRONTAL) {
    test(`before/after and render time on ${photo}`, async ({ page }) => {
      await openSimulation(page, photo);
      const stem = photo.replace(/\.[^.]+$/, '');
      mkdirSync(OUT, { recursive: true });

      // Start strength (60 %) for the regions that start switched on.
      const start = await sheets(page);
      writeFileSync(join(OUT, `${stem}-60.jpg`), bytes(start.pair));
      writeFileSync(join(OUT, `${stem}-60-diff.jpg`), bytes(start.diff));

      // Every enabled slider moved to 70 and then to the cap: the render times of real slider moves.
      const times: number[] = [];
      const sliders = page.getByRole('slider', { name: /^شدت / });
      const count = await sliders.count();
      for (let i = 0; i < count; i++) {
        const s = sliders.nth(i);
        if (await s.isDisabled()) continue;
        for (const v of ['70', '85']) {
          await s.fill(v);
          times.push(await settled(page));
        }
      }
      const cap = await sheets(page);
      writeFileSync(join(OUT, `${stem}-85.jpg`), bytes(cap.pair));
      writeFileSync(join(OUT, `${stem}-85-diff.jpg`), bytes(cap.diff));
      writeFileSync(join(OUT, `${stem}-after-85.jpg`), bytes(await jpg(after(page))));

      const sorted = [...times].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)]!;
      const size = await before(page).evaluate((c: HTMLCanvasElement) => `${c.width}x${c.height}`);
      writeFileSync(
        join(OUT, `${stem}.txt`),
        [
          `box=${size}`,
          `render ms (desktop chromium, worker): median=${median.toFixed(1)} max=${sorted.at(-1)!.toFixed(1)} n=${times.length}`,
          `start 60%: mean change=${start.mean.toFixed(2)}/255, pixels changed by >=2 levels=${(start.changed * 100).toFixed(1)}%`,
          `cap 85%:   mean change=${cap.mean.toFixed(2)}/255, pixels changed by >=2 levels=${(cap.changed * 100).toFixed(1)}%`,
          '',
        ].join('\n'),
      );
      expect(cap.mean).toBeGreaterThan(start.mean);
    });
  }
});
