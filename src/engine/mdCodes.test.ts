import { describe, expect, it } from 'vitest';
import { MD_CODE_INFO, MD_CODES, type MdCode } from '../data/mdCodes';
import { toFace } from './faceFrame';
import { syntheticMesh, syntheticPicture } from './fixtures';
import { R_BROW_UPPER, L_BROW_UPPER } from './landmarks';
import { CODE_SMOOTHING, clipToBand, partWeight } from './mdZones';
import { MAX_INTENSITY, prepare, render } from './pipeline';
import { displacement } from './warp';

/** The full MD Codes set of mode B (docs/TASKS.md M5c) on the synthetic face. */
describe('MD Codes codes (M5c)', () => {
  const mesh = syntheticMesh();
  const pic = syntheticPicture(-1.0);
  for (let y = 0; y < pic.height; y++)
    for (let x = 0; x < pic.width; x++) {
      const i = (y * pic.width + x) * 4;
      // Fine grain and broad shading, so both fine and broad (hollow, fold) smoothing change something.
      const v = (((x * 7) ^ (y * 13)) % 23) + 30 * (1 + Math.sin(x / 9) * Math.sin(y / 11));
      for (let ch = 0; ch < 3; ch++) pic.data[i + ch] = Math.max(0, pic.data[i + ch]! - v);
    }
  const prepared = prepare({ ...pic, landmarks: mesh });

  it('has all 51 codes with their family, each one with a zone on the photo on every side it has', () => {
    expect(MD_CODES).toHaveLength(51);
    for (const code of MD_CODES) {
      const zones = prepared.zones.filter((z) => z.site === code);
      const sides = MD_CODE_INFO[code].bilateral ? ['R', 'L'] : ['M'];
      expect(zones.map((z) => z.side).sort(), code).toEqual(sides.sort());
      for (const z of zones) expect(z.points.length, code).toBeGreaterThanOrEqual(3);
    }
  });

  it('splits a region into parts that add up to the whole, with soft seams', () => {
    for (const t of [0, 0.1, 0.2, 0.33, 0.5, 0.61, 0.8, 1]) {
      expect(partWeight(t, 0, 1 / 3) + partWeight(t, 1 / 3, 2 / 3) + partWeight(t, 2 / 3, 1)).toBeCloseTo(1, 6);
      expect(partWeight(t, 0, 0.2) + partWeight(t, 0.2, 0.4) + partWeight(t, 0.4, 0.6) + partWeight(t, 0.6, 0.8) + partWeight(t, 0.8, 1)).toBeCloseTo(1, 6);
    }
    // The masks of Tt1–Tt3 on one side add up to the under-eye mask.
    const whole = prepared.masks['tear-trough']!.find((m) => m.side === 'R')!.mask;
    const parts = (['Tt1', 'Tt2', 'Tt3'] as const).map((c) => prepared.codeMasks[c]!.find((m) => m.side === 'R')!.mask);
    let worst = 0;
    for (let i = 0; i < whole.data.length; i++) worst = Math.max(worst, Math.abs(parts.reduce((t, p) => t + p.data[i]!, 0) - whole.data[i]!));
    expect(worst).toBeLessThan(1e-5);
    // A clipped square keeps only its band.
    const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    const band = clipToBand(square, (p) => p.x, 0.25, 0.5);
    expect(Math.min(...band.map((p) => p.x))).toBeCloseTo(0.25);
    expect(Math.max(...band.map((p) => p.x))).toBeCloseTo(0.5);
  });

  it('a smoothing code changes only its own part of the region', () => {
    const base = render(prepared, []);
    for (const code of Object.keys(CODE_SMOOTHING) as MdCode[]) {
      const out = render(prepared, [], { sites: [{ site: code, intensity: MAX_INTENSITY }] });
      const masks = prepared.codeMasks[code]!;
      const w = prepared.rect.width;
      let inside = 0;
      let outside = 0;
      for (let i = 0; i < base.length; i += 4) {
        if (out[i] === base[i] && out[i + 1] === base[i + 1] && out[i + 2] === base[i + 2]) continue;
        const px = (i / 4) % w;
        const py = Math.floor(i / 4 / w);
        const own = masks.some(({ mask: m }) => px >= m.x && px < m.x + m.width && py >= m.y && py < m.y + m.height && m.data[(py - m.y) * m.width + (px - m.x)]! > 0);
        if (own) inside++;
        else outside++;
      }
      expect(inside, code).toBeGreaterThan(0);
      expect(outside, code).toBe(0);
    }
  });

  it('E3 is the only operator that moves a brow head (owner 2026-11-16); every other one leaves it alone', () => {
    const heads = [R_BROW_UPPER[R_BROW_UPPER.length - 1]!, L_BROW_UPPER[L_BROW_UPPER.length - 1]!].map((i) => toFace(prepared.frame, mesh[i]!));
    for (const { op } of prepared.ops) {
      const moved = heads.some((h) => Math.hypot(displacement(op, h).x, displacement(op, h).y) > 1e-6);
      expect(moved, `${op.site ?? op.concernId}:${op.side}`).toBe(op.site === 'E3');
    }
    expect(prepared.ops.some((p) => p.op.site === 'E3')).toBe(true);
  });
});
