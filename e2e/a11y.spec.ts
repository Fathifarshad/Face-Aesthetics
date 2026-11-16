import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { newCaseWithFrontal, setupVault } from './helpers';

/**
 * M10 accessibility pass (docs/PRD.md §13): every main screen has no WCAG 2.1 A/AA violation that axe-core finds,
 * and every control is at least 44 px (BRAND touch target). Synthetic data; the photo is a local test asset.
 */
const PHOTO = 'test-assets/portrait.jpg';
const OUT = 'test-results/a11y';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function audit(page: Page, name: string): Promise<string[]> {
  await page.waitForLoadState('networkidle');
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const lines = result.violations.flatMap((v) =>
    v.nodes.map((n) => `${name} · ${v.id} (${v.impact}) · ${n.target.join(' ')} · ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`),
  );
  return lines;
}

/** Visible buttons, links and form controls smaller than 44 px in both directions (the slider thumb excluded). */
const smallTargets = (page: Page, name: string) =>
  page.evaluate((name) => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('button, a[href], [role=switch], [role=radio], select, input:not([type=range]):not([type=file]):not([type=hidden])'));
    return els
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden') return false;
        // A checkbox or radio inside a label: the label is the target.
        const host = el.closest('label');
        const box = host && (el as HTMLInputElement).type?.match(/checkbox|radio/) ? host.getBoundingClientRect() : r;
        // Links inside running text are exempt (WCAG 2.5.8 inline exception).
        if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') return false;
        return Math.min(box.width, box.height) < 44 - 0.5;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30);
        return `${name} · small target ${Math.round(r.width)}×${Math.round(r.height)} · <${el.tagName.toLowerCase()}> ${label}`;
      });
  }, name);

test('main screens pass axe (WCAG 2.1 AA) and keep 44 px touch targets', async ({ page }) => {
  test.skip(!existsSync(PHOTO), 'needs a local test photo in test-assets/ (git-ignored)');
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const found: string[] = [];
  const check = async (name: string) => {
    found.push(...(await audit(page, name)), ...(await smallTargets(page, name)));
    await page.screenshot({ path: `${OUT}/${name}.png` });
    writeFileSync(`${OUT}/violations.txt`, found.join('\n') + '\n');
  };

  await page.goto('/');
  await check('home');
  await page.goto('/#/client');
  await check('client');
  await setupVault(page);
  await check('patients');
  await page.goto('/#/admin');
  await check('admin');
  const caseId = await newCaseWithFrontal(page, PHOTO);
  for (const step of ['intake', 'capture', 'grading', 'simulate', 'plan', 'mdcodes', 'report', 'gallery', 'compare']) {
    await page.goto(`/#/doctor/case/${caseId}/${step}`);
    await expect(page.locator('main').first()).toBeVisible();
    if (step === 'simulate') await expect(page.getByText(/\d+ × \d+ px/)).toBeVisible({ timeout: 90_000 });
    await check(step);
  }
  expect(found, found.join('\n')).toEqual([]);
});
