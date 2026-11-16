import { describe, expect, it } from 'vitest';
import { ANCHOR } from '../engine/landmarks';
import { alignTransform, frameMatches, type Framed } from './align';

/** A photo whose only known landmarks are the two outer eye corners. */
function photo(r: [number, number], l: [number, number], width = 1000, height = 1000): Framed {
  const landmarks: { x: number; y: number }[] = [];
  landmarks[ANCHOR.rEyeOuter] = { x: r[0], y: r[1] };
  landmarks[ANCHOR.lEyeOuter] = { x: l[0], y: l[1] };
  return { landmarks, width, height };
}

const apply = (m: number[], x: number, y: number) => [m[0]! * x + m[2]! * y + m[4]!, m[1]! * x + m[3]! * y + m[5]!];

describe('before/after framing', () => {
  const before = photo([400, 400], [600, 400]);

  it('accepts the same framing and small differences', () => {
    expect(frameMatches(before, photo([400, 400], [600, 400]))).toBe(true);
    expect(frameMatches(before, photo([395, 410], [600, 412]))).toBe(true);
  });

  it('flags another distance, a shifted face or a tilted head', () => {
    expect(frameMatches(before, photo([380, 400], [620, 400]))).toBe(false); // 20 % closer
    expect(frameMatches(before, photo([480, 400], [680, 400]))).toBe(false); // shifted 8 %
    expect(frameMatches(before, photo([400, 385], [600, 415]))).toBe(false); // tilted ~8.5°
  });

  it('needs a face in both photos', () => {
    expect(frameMatches(before, { landmarks: null, width: 1, height: 1 })).toBeNull();
  });

  it('maps the after eye corners onto the before eye corners', () => {
    const after = photo([300, 520], [520, 470], 1200, 1600);
    const m = alignTransform(before, after)!;
    const [rx, ry] = apply(m, 300, 520);
    const [lx, ly] = apply(m, 520, 470);
    expect(rx).toBeCloseTo(400, 6);
    expect(ry).toBeCloseTo(400, 6);
    expect(lx).toBeCloseTo(600, 6);
    expect(ly).toBeCloseTo(400, 6);
  });
});
