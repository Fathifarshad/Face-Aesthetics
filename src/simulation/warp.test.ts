import { describe, expect, it } from 'vitest';
import { syntheticFace } from '../analysis/fixtures';
import { boxBlur, buildSimPlan, ellipseWeight, intensityFromGap, sourceOffset } from './warp';

describe('simulation plan', () => {
  const face = syntheticFace();
  it('intensity from target gap', () => {
    expect(intensityFromGap(40, 40)).toBe(0);
    expect(intensityFromGap(40, 34)).toBeCloseTo(0.5);
    expect(intensityFromGap(60, 40)).toBe(1);
  });
  it('no displacement when intensity is 0', () => {
    const p = buildSimPlan(face, { jowl: 4, 'midface.volume': 4 }, 0);
    expect(p.controls).toHaveLength(0);
    expect(p.smoothing).toBe(0);
  });
  it('lifts the jaw (negative dy) proportionally to severity', () => {
    const half = buildSimPlan(face, { jowl: 2 }, 1).controls;
    const full = buildSimPlan(face, { jowl: 4 }, 1).controls;
    expect(full.length).toBe(6);
    expect(full.every((c) => c.dy < 0)).toBe(true);
    expect(full[0]!.dy).toBeCloseTo(half[0]!.dy * 2);
  });
  it('displacement decays with distance', () => {
    const c = [{ at: { x: 0, y: 0 }, dx: 0, dy: -10, sigma: 10 }];
    expect(sourceOffset(0, 0, c).dy).toBeCloseTo(10);
    expect(Math.abs(sourceOffset(100, 0, c).dy)).toBeLessThan(1e-6);
    expect(ellipseWeight(0, 0, { center: { x: 0, y: 0 }, rx: 5, ry: 5, amount: 1 })).toBe(1);
  });
  it('box blur preserves a constant image', () => {
    const src = new Float32Array(25).fill(7);
    expect(Array.from(boxBlur(src, 5, 5, 1)).every((v) => Math.abs(v - 7) < 1e-6)).toBe(true);
  });
});
