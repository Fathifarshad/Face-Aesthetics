import { describe, expect, it } from 'vitest';
import { contrastOnWhite, REPORT_ACCENT_FALLBACK, safeAccent } from './color';

describe('report accent contrast', () => {
  it('computes WCAG contrast', () => {
    expect(contrastOnWhite('#000000')).toBeCloseTo(21, 1);
    expect(contrastOnWhite('#ffffff')).toBeCloseTo(1, 5);
    expect(contrastOnWhite('nope')).toBeNull();
  });
  it('falls back when contrast < 4.5', () => {
    expect(safeAccent('#D4AF37')).toBe(REPORT_ACCENT_FALLBACK);
    expect(safeAccent('#0B6E6E')).toBe('#0B6E6E');
    expect(contrastOnWhite(REPORT_ACCENT_FALLBACK)!).toBeGreaterThanOrEqual(4.5);
  });
});
