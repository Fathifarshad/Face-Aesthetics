import { describe, expect, it } from 'vitest';
import { syntheticFace } from '../analysis/fixtures';
import { faceStats, laplacianVariance, meanInRect, toGray } from './imageStats';
import { evaluateQc, type QcInput } from './qc';
import { requiredViews } from './services';
import { viewById } from './views';

const frontal = viewById('frontal')!;
const good: QcInput = {
  faces: 1,
  pose: { yaw: 1, pitch: 2, roll: 1 },
  faceHeightRatio: 0.55,
  faceLum: 140,
  cheekDiff: 0.05,
  blur: 120,
  backlight: 0.9,
};

describe('QC', () => {
  it('passes a good frontal photo', () => {
    expect(evaluateQc(good, frontal).pass).toBe(true);
  });
  it('fails with a fix hint', () => {
    const r = evaluateQc({ ...good, faceHeightRatio: 0.3, faceLum: 60 }, frontal);
    expect(r.pass).toBe(false);
    expect(r.checks.find((c) => c.id === 'size')!.hint).toBe('move-closer');
    expect(r.checks.find((c) => c.id === 'exposure')!.hint).toBe('more-light');
  });
  it('checks yaw magnitude for 45° views', () => {
    const v = viewById('oblique-r')!;
    expect(evaluateQc({ ...good, pose: { yaw: -44, pitch: 0, roll: 0 } }, v).checks.find((c) => c.id === 'pose')!.pass).toBe(true);
    expect(evaluateQc({ ...good, pose: { yaw: 20, pitch: 0, roll: 0 } }, v).checks.find((c) => c.id === 'pose')!.hint).toBe('turn-more');
  });
  it('profile without detection is not failed (manual mode)', () => {
    const v = viewById('profile-r')!;
    const r = evaluateQc({ ...good, faces: 0, pose: null, faceHeightRatio: null }, v);
    expect(r.pass).toBe(true);
    expect(r.checks.find((c) => c.id === 'pose')!.pass).toBeNull();
  });
  it('more than one face fails', () => {
    expect(evaluateQc({ ...good, faces: 2 }, frontal).pass).toBe(false);
  });
});

describe('services', () => {
  it('unions required views in capture order', () => {
    expect(requiredViews(['upper-toxin', 'skin'])).toEqual(['frontal', 'oblique-r', 'oblique-l', 'smile', 'frown', 'brows-raised']);
    expect(requiredViews(['full-analysis'])).toHaveLength(11);
    expect(requiredViews([])).toEqual(['frontal']);
  });
});

describe('image stats', () => {
  const w = 100,
    h = 100;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = (i % w) < 50 ? 100 : 200;
    rgba.set([v, v, v, 255], i * 4);
  }
  const g = toGray(rgba, w, h);
  it('mean luminance in rect', () => {
    expect(meanInRect(g, { x: 0, y: 0, w: 50, h: 100 })).toBeCloseTo(100, 3);
    expect(meanInRect(g, { x: 50, y: 0, w: 50, h: 100 })).toBeCloseTo(200, 3);
  });
  it('flat area has zero Laplacian variance; an edge does not', () => {
    expect(laplacianVariance(g, { x: 0, y: 0, w: 40, h: 100 })).toBeCloseTo(0, 6);
    expect(laplacianVariance(g, { x: 40, y: 0, w: 20, h: 100 })).toBeGreaterThan(0);
  });
  it('face stats from landmarks', () => {
    const face = syntheticFace().map((p) => ({ x: p.x / 10, y: p.y / 10 }));
    const s = faceStats(g, face);
    expect(s.faceHeightRatio).toBeCloseTo((70 - 20) / 100, 3);
    expect(s.cheekDiff).toBeGreaterThan(0.4);
  });
});
