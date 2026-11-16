// Renders the PNG app icons from public/icon.svg (Android and iOS need PNG to install the PWA).
// Uses the Playwright Chromium that is already a dev dependency. Run: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icon.svg', 'utf8');
const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
// The icon's own background colour (bg token); the maskable icon fills its safe-zone margin with it.
const BG = '#0A0A0B';

const ICONS = [
  { file: 'icon-192.png', size: 192, scale: 1, round: true },
  { file: 'icon-512.png', size: 512, scale: 1, round: true },
  // Maskable: the platform crops to its own shape; keep the drawing inside the central 80 % safe zone.
  { file: 'icon-maskable-512.png', size: 512, scale: 0.72, round: false },
  // iOS draws its own rounded corners and ignores transparency.
  { file: 'apple-touch-icon.png', size: 180, scale: 0.86, round: false },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const icon of ICONS) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  const inner = Math.round(icon.size * icon.scale);
  const bg = icon.round ? 'transparent' : BG;
  await page.setContent(
    `<body style="margin:0;width:${icon.size}px;height:${icon.size}px;display:grid;place-items:center;background:${bg}">` +
      `<img src="${src}" width="${inner}" height="${inner}"></body>`,
  );
  await page.locator('img').evaluate((img) => img.decode());
  await page.screenshot({ path: `public/${icon.file}`, omitBackground: icon.round });
  console.log(`public/${icon.file}`);
}
await browser.close();
