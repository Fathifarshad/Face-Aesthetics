const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio of a colour against white. */
export function contrastOnWhite(hex: string): number | null {
  const l = luminance(hex);
  return l === null ? null : 1.05 / (l + 0.05);
}

export const REPORT_ACCENT_FALLBACK = '#7A5F12';

/** Report accent must reach 4.5:1 on white (docs/BRAND.md §2), otherwise use the fallback. */
export function safeAccent(hex: string): string {
  const c = contrastOnWhite(hex);
  return c !== null && c >= 4.5 ? hex : REPORT_ACCENT_FALLBACK;
}
