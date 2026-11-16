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

/** Changes with a smoothing effect, except whole-face skin and neck (they started off before M5 too). */
const SMOOTHING_CHANGES = ['خطوط پیشانی', 'خط اخم', 'پنجه‌کلاغی', 'گودی زیر چشم', 'چین نازولبیال (خط خنده)', 'خطوط ماریونت', 'خطوط دور لب', 'چانه', 'گودی شقیقه'];

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
    // The burned-in label bar at the bottom is not part of the simulation; leave it out of the numbers.
    const bar = Math.round(Math.max(11, Math.round((w * 11) / 390)) * 2.2) + 1;
    const counted = w * (h - bar);
    for (let i = 0; i < w * (h - bar) * 4; i += 4) {
      const delta = (Math.abs(pa[i]! - pb[i]!) + Math.abs(pa[i + 1]! - pb[i + 1]!) + Math.abs(pa[i + 2]! - pb[i + 2]!)) / 3;
      sum += delta;
      if (delta >= 2) changed++;
      const v = Math.min(255, delta * 8);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    }
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    d.putImageData(img, 0, 0);
    // Middle of the face at 2x (eyes to chin), before | after: skin texture is judged here.
    const zx = Math.round(w * 0.12);
    const zy = Math.round(h * 0.3);
    const zw = Math.round(w * 0.76);
    const zh = Math.round(h * 0.42);
    const zoom = document.createElement('canvas');
    zoom.width = zw * 4 + 8;
    zoom.height = zh * 2;
    const z = zoom.getContext('2d')!;
    z.imageSmoothingEnabled = false;
    z.drawImage(b!, zx, zy, zw, zh, 0, 0, zw * 2, zh * 2);
    z.drawImage(a!, zx, zy, zw, zh, zw * 2 + 8, 0, zw * 2, zh * 2);
    return {
      pair: pair.toDataURL('image/jpeg', 0.92),
      diff: diff.toDataURL('image/jpeg', 0.9),
      zoom: zoom.toDataURL('image/jpeg', 0.92),
      mean: sum / counted,
      changed: changed / counted,
    };
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

/** Presses a control with the keyboard: on a phone the pinned photo can cover the list, so a pointer click may not reach it. */
async function press(page: Page, control: Locator) {
  await control.focus();
  await page.keyboard.press('Space');
}

/** Test photos of men: the chin and jaw-angle operators depend on the recorded sex. */
const MEN = new Set(['20261112_230515.jpg', 'portrait.jpg']);

async function openSimulation(page: Page, photo: string) {
  await setupVault(page);
  const caseId = await newCaseWithFrontal(page, join(ASSETS, photo), MEN.has(photo) ? 'مرد' : 'زن');
  await page.goto(`/#/doctor/case/${caseId}/simulate`);
  await settled(page);
}

test.describe('simulation page', () => {
  test.skip(FRONTAL.length === 0, 'needs a local frontal test photo in test-assets/ (git-ignored)');

  test('switches, sliders, all off, and the compare divider', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await openSimulation(page, FRONTAL[0]!);

    // M5: with no confirmed grade every change starts off, and the page says why.
    await expect(page.getByText('هنوز درجه‌ای تأیید نشده است', { exact: false })).toBeVisible();
    for (const name of ['خطوط پیشانی', 'کیفیت و بافت پوست', 'پهنی فک (ماستر)', 'حجم و فرم لب'])
      await expect(page.getByRole('switch', { name })).toHaveAttribute('aria-checked', 'false');
    expect(await differenceAboveLabel(page)).toBe(0);
    // Switched on by hand: one switch and one slider per region, capped at 85.
    await press(page, page.getByRole('button', { name: 'همه روشن' }));
    await settled(page);
    await expect(page.getByRole('switch', { name: 'خطوط پیشانی' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('slider', { name: 'شدت خطوط پیشانی' })).toHaveAttribute('max', '85');
    expect(await differenceAboveLabel(page)).toBeGreaterThan(0);

    // Everything off: "after" equals "before" except for the label (zero strength returns the input).
    await press(page, page.getByRole('button', { name: 'همه خاموش' }));
    await settled(page);
    expect(await differenceAboveLabel(page)).toBe(0);
    await press(page, page.getByRole('button', { name: 'همه روشن' }));
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

    // M6 (PRD F5.3): choosing a treatment option re-renders at once and caps the slider; drafts carry the badge.
    const forehead = page.locator('#change-forehead-lines');
    await expect(forehead.getByRole('radio', { name: 'توکسین فرونتالیس برای خطوط پیشانی' })).toHaveAttribute('aria-checked', 'true');
    await expect(forehead.getByText('تأییدنشده')).toBeVisible();
    await press(page, page.getByRole('button', { name: 'همه خاموش' }));
    await press(page, page.getByRole('switch', { name: 'خطوط پیشانی' }));
    await page.getByRole('slider', { name: 'شدت خطوط پیشانی', exact: true }).fill('85');
    await settled(page);
    const withToxin = await differenceAboveLabel(page);
    await press(page, forehead.getByRole('radio', { name: 'اسکین‌بوستر برای خطوط پیشانی' }));
    await expect(page.getByRole('slider', { name: 'شدت خطوط پیشانی', exact: true })).toHaveAttribute('max', '35');
    await expect(forehead.locator('[data-option]')).toHaveAttribute('data-option', /forehead-lines\.2\.skinbooster/);
    await settled(page);
    const withBooster = await differenceAboveLabel(page);
    expect(withBooster).toBeGreaterThan(0);
    expect(withBooster).toBeLessThan(withToxin);
    await press(page, forehead.getByRole('radio', { name: 'توکسین فرونتالیس برای خطوط پیشانی' }));
    await press(page, page.getByRole('button', { name: 'همه خاموش' }));
    await press(page, page.getByRole('button', { name: 'همه روشن' }));
    await settled(page);

    // M4: switching a shape change on changes the picture.
    const masseter = page.getByRole('switch', { name: 'پهنی فک (ماستر)' });
    await press(page, page.getByRole('button', { name: 'همه خاموش' }));
    await settled(page);
    await press(page, masseter);
    await settled(page);
    expect(await differenceAboveLabel(page)).toBeGreaterThan(0);

    // Mirror on by default: one slider. Off: one slider per side, and «هم‌اندازه کن» copies the side moved last.
    const mirror = page.getByRole('checkbox', { name: 'آینهٔ دو طرف برای پهنی فک (ماستر)' });
    await expect(mirror).toBeChecked();
    await expect(page.getByRole('slider', { name: 'شدت پهنی فک (ماستر)', exact: true })).toBeVisible();
    await press(page, mirror);
    const right = page.getByRole('slider', { name: 'شدت پهنی فک (ماستر)، راستِ بیمار' });
    const left = page.getByRole('slider', { name: 'شدت پهنی فک (ماستر)، چپِ بیمار' });
    await expect(right).toBeVisible();
    await expect(left).toBeVisible();
    await left.fill('0');
    await settled(page);
    const oneSide = await differenceAboveLabel(page);
    expect(oneSide).toBeGreaterThan(0);
    const matchButton = page.getByRole('button', { name: 'هم‌اندازه کردن دو طرف پهنی فک (ماستر)' });
    await expect(matchButton).toBeEnabled();
    await right.fill('60');
    await press(page, matchButton);
    await expect(left).toHaveValue('60');
    await expect(matchButton).toBeDisabled();
    await press(page, mirror);
    await expect(mirror).toBeChecked();
    await expect(page.getByRole('slider', { name: 'شدت پهنی فک (ماستر)', exact: true })).toHaveValue('60');

    // Touching a region on the photo opens its change and outlines the region (F4.7). The divider is at 20 %,
    // so a press in the middle of the picture is a tap, not a drag.
    await page.getByRole('slider', { name: 'جابه‌جایی خط مقایسهٔ قبل و بعد' }).fill('20');
    const box = (await before(page).boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.42);
    const current = page.locator('li[aria-current="true"]');
    await expect(current).toHaveCount(1);
    await expect(page.locator('svg[data-selected] polygon').first()).toBeVisible();

    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: join(OUT, `page-${width}.png`) });
    }
    expect(errors).toEqual([]);
  });

  test('MD Codes mode: one mode at a time, families start from mode A and open into codes, each mode keeps its settings (M5b, M5c)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await openSimulation(page, FRONTAL[0]!);
    const modeA = page.getByRole('radio', { name: 'حجم‌دهی بر اساس ناحیه' });
    const modeB = page.getByRole('radio', { name: 'حجم‌دهی فیلر بر اساس MD Codes' });
    const disclaimer = page.getByText('MD Codes™ نشان تجاری است. جانمایی تقریبی است و راهنمای تزریق نیست.');
    const zones = (n: number) => page.locator(`svg[data-md-zones="${n}"]`);
    await expect(modeA).toHaveAttribute('aria-checked', 'true');
    await expect(disclaimer).toHaveCount(0);

    // Mode A: cheek volume at 60 %.
    await press(page, page.getByRole('switch', { name: 'افت حجم میانهٔ صورت' }));
    await page.getByRole('slider', { name: 'شدت افت حجم میانهٔ صورت', exact: true }).fill('60');
    await settled(page);
    const pictureA = await jpg(after(page));

    // Mode B: the cheek slider is gone, the Ck family starts at 60 %, smoothing sliders stay, the fixed text and the
    // source with the «تأییدنشده» badge show. Codes are folded into their family until opened.
    await press(page, modeB);
    await expect(modeB).toHaveAttribute('aria-checked', 'true');
    await expect(disclaimer).toBeVisible();
    await expect(page.getByText(/PMC8012343/)).toBeVisible();
    await expect(page.getByRole('switch', { name: 'افت حجم میانهٔ صورت' })).toHaveCount(0);
    await expect(page.getByRole('switch', { name: 'گودی زیر چشم' })).toHaveCount(0);
    await expect(page.getByRole('switch', { name: 'خطوط پیشانی' })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'پهنی فک (ماستر)' })).toBeVisible();
    const ck = page.getByRole('switch', { name: 'Ck · گونه', exact: true });
    await expect(ck).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('slider', { name: 'شدت Ck · گونه', exact: true })).toHaveValue('60');
    for (const family of ['F · پیشانی', 'Tt · ناودان اشکی', 'N · بینی', 'Lp · لب', 'Jw · خط فک'])
      await expect(page.getByRole('switch', { name: family, exact: true })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Ck1 · قوس زایگوما' })).toHaveCount(0);
    const open = page.getByRole('button', { name: /^کدهای Ck / });
    await expect(open).toHaveAttribute('aria-expanded', 'false');
    await press(page, open);
    await expect(open).toHaveAttribute('aria-expanded', 'true');
    for (const code of ['Ck1 · قوس زایگوما', 'Ck2 · برجستگی زایگوما', 'Ck3 · گونهٔ قدامی‌میانی']) {
      await expect(page.getByRole('switch', { name: code })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('slider', { name: `شدت ${code}`, exact: true })).toHaveValue('60');
    }
    // Ck4 and Ck5 are new in M5c and start off.
    await expect(page.getByRole('switch', { name: /^Ck4 · / })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('switch', { name: /^Ck5 · / })).toHaveAttribute('aria-checked', 'false');
    await settled(page);
    // Shaded zones with the code name for the filled codes (two sides × three cheek codes).
    await expect(zones(6)).toBeVisible();
    await expect(page.locator('svg[data-md-zones] text', { hasText: 'Ck2' })).toHaveCount(2);

    // Ck2 lower, Ck3 off, Ck4 on: the picture changes and the zones follow the switches.
    await page.getByRole('slider', { name: 'شدت Ck2 · برجستگی زایگوما', exact: true }).fill('30');
    await settled(page);
    await press(page, page.getByRole('switch', { name: 'Ck3 · گونهٔ قدامی‌میانی' }));
    await settled(page);
    await expect(zones(4)).toBeVisible();
    await press(page, page.getByRole('switch', { name: /^Ck4 · / }));
    await settled(page);
    await expect(zones(6)).toBeVisible();
    await expect(page.getByRole('slider', { name: /^شدت Ck4 · / })).toHaveValue('60');
    const pictureB = await jpg(after(page));
    expect(pictureB).not.toEqual(pictureA);
    // The family switch turns its codes off together; switched on again they come back as they were.
    await press(page, ck);
    await settled(page);
    await expect(zones(0)).toBeVisible();
    await press(page, ck);
    await settled(page);
    await expect(zones(6)).toBeVisible();
    // The family slider moves the codes that follow it; a code moved by hand keeps its value.
    await page.getByRole('slider', { name: 'شدت Ck · گونه', exact: true }).fill('70');
    await expect(page.getByRole('slider', { name: 'شدت Ck1 · قوس زایگوما', exact: true })).toHaveValue('70');
    await expect(page.getByRole('slider', { name: 'شدت Ck2 · برجستگی زایگوما', exact: true })).toHaveValue('30');
    // Nose: off at first; switching the family on switches its five codes on.
    await press(page, page.getByRole('switch', { name: 'N · بینی', exact: true }));
    await settled(page);
    await expect(page.getByRole('button', { name: /^کدهای N \(5 روشن از 5\)/ })).toBeVisible();
    await expect(zones(11)).toBeVisible();
    // Midline codes have no mirror switch; E3 (brow head) has its own switch.
    await press(page, page.getByRole('button', { name: /^کدهای E / }));
    await expect(page.getByRole('switch', { name: /^E3 · سر ابرو/ })).toBeVisible();
    await press(page, page.getByRole('button', { name: /^کدهای C / }));
    await expect(page.getByRole('checkbox', { name: /^آینهٔ دو طرف برای C2 · / })).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: /^آینهٔ دو طرف برای C3 · / })).toHaveCount(1);
    await settled(page);
    const pictureB2 = await jpg(after(page));

    // Back to mode A: as it was.
    await press(page, modeA);
    await expect(disclaimer).toHaveCount(0);
    await expect(page.locator('svg[data-md-zones]')).toHaveCount(0);
    await expect(page.getByRole('slider', { name: 'شدت افت حجم میانهٔ صورت', exact: true })).toHaveValue('60');
    await expect(page.getByRole('switch', { name: 'Ck · گونه', exact: true })).toHaveCount(0);
    await settled(page);
    expect(await jpg(after(page))).toEqual(pictureA);

    // And mode B keeps the doctor's own sliders and switches.
    await press(page, modeB);
    await expect(page.getByRole('switch', { name: 'Ck · گونه', exact: true })).toBeVisible();
    const reopen = page.getByRole('button', { name: /^کدهای Ck / });
    if ((await reopen.getAttribute('aria-expanded')) !== 'true') await press(page, reopen);
    await expect(page.getByRole('slider', { name: 'شدت Ck2 · برجستگی زایگوما', exact: true })).toHaveValue('30');
    await expect(page.getByRole('switch', { name: 'Ck3 · گونهٔ قدامی‌میانی' })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('switch', { name: /^Ck4 · / })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('slider', { name: 'شدت Ck1 · قوس زایگوما', exact: true })).toHaveValue('70');
    await settled(page);
    expect(await jpg(after(page))).toEqual(pictureB2);

    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: join(OUT, `mdcodes-page-${width}.png`) });
    }
    expect(errors).toEqual([]);
  });

  for (const photo of FRONTAL) {
    test(`before/after and render time on ${photo}`, async ({ page }) => {
      // Every MD Codes family alone (M5c) adds a few dozen renders.
      test.setTimeout(360_000);
      await openSimulation(page, photo);
      const stem = photo.replace(/\.[^.]+$/, '');
      mkdirSync(OUT, { recursive: true });

      // The smoothing changes switched on by hand at 75 % (before M5 this was the start state; since M5 every
      // change starts at its age-appropriate default, which is off while no grade is confirmed).
      for (const name of SMOOTHING_CHANGES) {
        await press(page, page.getByRole('switch', { name }));
        await page.getByRole('slider', { name: `شدت ${name}`, exact: true }).fill('75');
      }
      await settled(page);
      const start = await sheets(page);
      writeFileSync(join(OUT, `${stem}-start.jpg`), bytes(start.pair));
      writeFileSync(join(OUT, `${stem}-start-diff.jpg`), bytes(start.diff));
      writeFileSync(join(OUT, `${stem}-start-zoom.jpg`), bytes(start.zoom));

      // Every enabled slider moved to 80 and then to the cap: the render times of real slider moves.
      const times: number[] = [];
      const sliders = page.getByRole('slider', { name: /^شدت / });
      const count = await sliders.count();
      for (let i = 0; i < count; i++) {
        const s = sliders.nth(i);
        if (await s.isDisabled()) continue;
        for (const v of ['80', '85']) {
          await s.fill(v);
          times.push(await settled(page));
        }
      }
      const cap = await sheets(page);
      writeFileSync(join(OUT, `${stem}-85.jpg`), bytes(cap.pair));
      // Smoothing at the cap is the reference for the shape changes below.
      writeFileSync(join(OUT, `${stem}-85-diff.jpg`), bytes(cap.diff));
      writeFileSync(join(OUT, `${stem}-85-zoom.jpg`), bytes(cap.zoom));
      writeFileSync(join(OUT, `${stem}-after-85.jpg`), bytes(await jpg(after(page))));

      // M4: every shape change switched on as well, at the start strength, then each one alone.
      const shapes = ['افت حجم میانهٔ صورت', 'حجم و فرم لب', 'خط فک و جول', 'پهنی فک (ماستر)', 'افت ابرو'];
      for (const name of shapes) {
        await press(page, page.getByRole('switch', { name }));
        await page.getByRole('slider', { name: `شدت ${name}`, exact: true }).fill('75');
      }
      const warpTimes: number[] = [];
      for (const name of shapes) {
        for (const v of ['80', '85']) {
          await page.getByRole('slider', { name: `شدت ${name}`, exact: true }).fill(v);
          warpTimes.push(await settled(page));
        }
      }
      const warped = await sheets(page);
      writeFileSync(join(OUT, `${stem}-warp.jpg`), bytes(warped.pair));
      writeFileSync(join(OUT, `${stem}-warp-diff.jpg`), bytes(warped.diff));
      writeFileSync(join(OUT, `${stem}-warp-zoom.jpg`), bytes(warped.zoom));
      const sortedWarp = [...warpTimes].sort((a, b) => a - b);

      // M5b–M5c: MD Codes mode. (1) Every family that starts on, at 75 % with its starting codes (smoothing stays at
      // 85 %), and the zones drawn on the photo.
      const split = page.getByRole('slider', { name: 'جابه‌جایی خط مقایسهٔ قبل و بعد' });
      await press(page, page.getByRole('radio', { name: 'حجم‌دهی فیلر بر اساس MD Codes' }));
      // The mode is saved first and the list follows the database.
      await expect(page.getByRole('switch', { name: 'Ck · گونه', exact: true })).toBeVisible();
      const familySwitches = page.getByRole('switch', { name: /^(F|T|G|E|O|Tt|N|Ck|NL|Lp|M|C|Jw) · / });
      const families = await familySwitches.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!));
      const setFamily = async (name: string, value: string | null) => {
        const sw = page.getByRole('switch', { name, exact: true });
        if ((await sw.getAttribute('aria-checked')) !== String(value !== null)) await press(page, sw);
        if (value) await page.getByRole('slider', { name: `شدت ${name}`, exact: true }).fill(value);
      };
      for (const name of families) if (!/^(F|G|O|N) · /.test(name)) await setFamily(name, '75');
      await settled(page);
      const md = await sheets(page);
      writeFileSync(join(OUT, `${stem}-mdcodes.jpg`), bytes(md.pair));
      writeFileSync(join(OUT, `${stem}-mdcodes-diff.jpg`), bytes(md.diff));
      writeFileSync(join(OUT, `${stem}-mdcodes-zoom.jpg`), bytes(md.zoom));
      await split.fill('0');
      await before(page).locator('..').screenshot({ path: join(OUT, `${stem}-mdcodes-zones.png`) });
      await split.fill('50');
      expect(families.length).toBeGreaterThanOrEqual(12);

      // (2) Each family alone with every one of its codes on at 75 % (everything else off): each code shows in its own zone.
      await press(page, page.getByRole('button', { name: 'همه خاموش' }));
      for (const name of families) {
        const family = name.split(' · ')[0]!;
        await setFamily(name, '75');
        const toggle = page.getByRole('button', { name: new RegExp(`^کدهای ${family} `) });
        if ((await toggle.getAttribute('aria-expanded')) !== 'true') await press(page, toggle);
        const codes = page.getByRole('switch', { name: new RegExp(`^${family}\\d · `) });
        const n = await codes.count();
        for (let i = 0; i < n; i++) if ((await codes.nth(i).getAttribute('aria-checked')) !== 'true') await press(page, codes.nth(i));
        await settled(page);
        const one = await sheets(page);
        writeFileSync(join(OUT, `${stem}-md-${family}.jpg`), bytes(one.pair));
        writeFileSync(join(OUT, `${stem}-md-${family}-zoom.jpg`), bytes(one.zoom));
        await split.fill('0');
        await before(page).locator('..').screenshot({ path: join(OUT, `${stem}-md-${family}-zones.png`) });
        await split.fill('50');
        await setFamily(name, null);
      }

      // (3) Every family and every code at 75 % together: the stress case (no fold, no tear).
      for (const name of families) await setFamily(name, '75');
      await settled(page);
      const all = await sheets(page);
      writeFileSync(join(OUT, `${stem}-mdall.jpg`), bytes(all.pair));
      writeFileSync(join(OUT, `${stem}-mdall-zoom.jpg`), bytes(all.zoom));

      const sorted = [...times].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)]!;
      const size = await before(page).evaluate((c: HTMLCanvasElement) => `${c.width}x${c.height}`);
      const lipFullness = await page.locator('[data-lip-fullness]').getAttribute('data-lip-fullness');
      const lipType = await page.getByRole('radio', { name: /^تیپ لب/, checked: true }).getAttribute('aria-label');
      writeFileSync(
        join(OUT, `${stem}.txt`),
        [
          `box=${size}`,
          `lip fullness=${lipFullness} → ${lipType}`,
          `render ms (desktop chromium, worker): median=${median.toFixed(1)} max=${sorted.at(-1)!.toFixed(1)} n=${times.length}`,
          `start 75%: mean change=${start.mean.toFixed(2)}/255, pixels changed by >=2 levels=${(start.changed * 100).toFixed(1)}%`,
          `cap 85%:   mean change=${cap.mean.toFixed(2)}/255, pixels changed by >=2 levels=${(cap.changed * 100).toFixed(1)}%`,
          `with shape changes (warp) at 85%: render ms median=${sortedWarp[Math.floor(sortedWarp.length / 2)]!.toFixed(1)} max=${sortedWarp.at(-1)!.toFixed(1)} n=${warpTimes.length}`,
          `with shape changes: mean change=${warped.mean.toFixed(2)}/255, pixels changed by >=2 levels=${(warped.changed * 100).toFixed(1)}%`,
          '',
        ].join('\n'),
      );
      expect(cap.mean).toBeGreaterThan(start.mean);
      expect(warped.mean).toBeGreaterThan(cap.mean);
    });
  }
});
