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

// Android app (android/, Trusted Web Activity): legacy launcher icons per density, the adaptive-icon foreground
// (drawing only, inside the 66/108 safe zone; the background layer is the bg colour) and the splash image.
const RES = 'android/app/src/main/res';
const art = svg.replace(/<rect[^>]*\/>/, '');
const artSrc = `data:image/svg+xml;base64,${Buffer.from(art).toString('base64')}`;
const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [d, size] of Object.entries(DENSITIES)) {
  ICONS.push({ file: `${RES}/mipmap-${d}/ic_launcher.png`, size, scale: 1, round: true });
}
ICONS.push({ file: `${RES}/drawable-nodpi/ic_launcher_foreground.png`, size: 432, scale: 0.62, round: true, src: artSrc });
ICONS.push({ file: `${RES}/drawable-nodpi/splash.png`, size: 384, scale: 1, round: true });

const { mkdirSync } = await import('node:fs');
const { dirname } = await import('node:path');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const icon of ICONS) {
  const path = icon.file.includes('/') ? icon.file : `public/${icon.file}`;
  mkdirSync(dirname(path), { recursive: true });
  await page.setViewportSize({ width: icon.size, height: icon.size });
  const inner = Math.round(icon.size * icon.scale);
  const bg = icon.round ? 'transparent' : BG;
  await page.setContent(
    `<body style="margin:0;width:${icon.size}px;height:${icon.size}px;display:grid;place-items:center;background:${bg}">` +
      `<img src="${icon.src ?? src}" width="${inner}" height="${inner}"></body>`,
  );
  await page.locator('img').evaluate((img) => img.decode());
  await page.screenshot({ path, omitBackground: icon.round });
  console.log(path);
}
await browser.close();
