import { dist, lerp, midpoint } from '../analysis/geometry';
import { LM } from '../analysis/landmarks';
import type { Landmarks, Point } from '../analysis/types';

/**
 * Approximate, local "target-age" simulation. Not a prediction of a treatment result:
 * subtle landmark-guided lifts plus shadow softening and skin smoothing, scaled by
 * intensity (target gap) and the graded severity of each region.
 */
export type Control = { at: Point; dx: number; dy: number; sigma: number };
export type ToneRegion = { center: Point; rx: number; ry: number; amount: number };
export type SimPlan = { controls: Control[]; shadows: ToneRegion[]; smoothing: number; lineSoftening: ToneRegion[] };

/** Strength from the age gap: 0 at no gap, 1 at ≥ 12 years. */
export const intensityFromGap = (actual: number, target: number): number => Math.max(0, Math.min(1, (actual - target) / 12));

const sevK = (sev: Record<string, number>, ...keys: string[]) => Math.max(0, ...keys.map((k) => sev[k] ?? 0)) / 4;

export function buildSimPlan(lm: Landmarks, sev: Record<string, number>, intensity: number): SimPlan {
  const P = (i: number) => lm[i]!;
  const s = dist(P(LM.glabella), P(LM.menton));
  const midX = (P(LM.glabella).x + P(LM.menton).x) / 2;
  const inward = (p: Point) => (p.x < midX ? 1 : -1);
  const controls: Control[] = [];
  const add = (at: Point, dx: number, dy: number, sigma: number) => {
    if (dx !== 0 || dy !== 0) controls.push({ at, dx, dy, sigma });
  };

  const mid = intensity * sevK(sev, 'midface.volume', 'nasolabial');
  for (const [z, a] of [
    [LM.zygionR, LM.alarR],
    [LM.zygionL, LM.alarL],
  ] as const) {
    const c = lerp(P(z), P(a), 0.45);
    add(c, -inward(c) * 0.006 * s * mid, -0.022 * s * mid, 0.13 * s);
  }

  const jaw = intensity * sevK(sev, 'jowl', 'jawline.definition');
  for (const i of [136, 150, 149, 365, 379, 378]) {
    const p = P(i);
    add(p, inward(p) * 0.012 * s * jaw, -0.022 * s * jaw, 0.075 * s);
  }

  const brow = intensity * sevK(sev, 'brow.ptosis', 'temple.hollowing');
  for (const i of [LM.browR[0], LM.browR[1], LM.browL[0], LM.browL[1]]) add(P(i), 0, -0.014 * s * brow, 0.06 * s);

  const lips = intensity * sevK(sev, 'lips.volume');
  add(P(LM.labraleSuperius), 0, -0.01 * s * lips, 0.04 * s);
  add(P(LM.labraleInferius), 0, 0.01 * s * lips, 0.045 * s);

  const chin = intensity * sevK(sev, 'chin.retrusion');
  add(P(LM.menton), 0, 0.012 * s * chin, 0.07 * s);

  const shadows: ToneRegion[] = [];
  const tt = intensity * Math.max(sevK(sev, 'teartrough'), 0.25);
  for (const [exo, endo] of [
    [LM.exocanthionR, LM.endocanthionR],
    [LM.exocanthionL, LM.endocanthionL],
  ] as const) {
    const c = midpoint(P(exo), P(endo));
    const w = dist(P(exo), P(endo));
    shadows.push({ center: { x: c.x, y: c.y + 0.55 * w }, rx: 0.65 * w, ry: 0.3 * w, amount: tt });
  }
  const nl = intensity * sevK(sev, 'nasolabial', 'midface.volume');
  const mar = intensity * sevK(sev, 'marionette');
  for (const [a, c] of [
    [LM.alarR, LM.cheilionR],
    [LM.alarL, LM.cheilionL],
  ] as const) {
    const m = lerp(P(a), P(c), 0.5);
    const len = dist(P(a), P(c));
    shadows.push({ center: { x: m.x - inward(m) * 0.12 * len, y: m.y }, rx: 0.28 * len, ry: 0.65 * len, amount: nl });
    const below = P(c);
    shadows.push({ center: { x: below.x - inward(below) * 0.05 * len, y: below.y + 0.45 * len }, rx: 0.22 * len, ry: 0.45 * len, amount: mar });
  }

  const lineSoftening: ToneRegion[] = [];
  const forehead = intensity * sevK(sev, 'lines.forehead', 'lines.glabella');
  const fc = lerp(P(LM.foreheadTop), P(LM.glabella), 0.5);
  lineSoftening.push({ center: fc, rx: 0.32 * s, ry: 0.14 * s, amount: forehead });
  const crow = intensity * sevK(sev, 'lines.crowsfeet');
  for (const exo of [LM.exocanthionR, LM.exocanthionL]) {
    const p = P(exo);
    lineSoftening.push({ center: { x: p.x - inward(p) * 0.06 * s, y: p.y }, rx: 0.06 * s, ry: 0.07 * s, amount: crow });
  }

  const smoothing = intensity * (0.35 + 0.65 * sevK(sev, 'skin.quality'));
  return { controls, shadows: shadows.filter((r) => r.amount > 0), smoothing, lineSoftening: lineSoftening.filter((r) => r.amount > 0) };
}

/** Backward-mapping displacement: where to sample the source for output pixel (x, y). */
export function sourceOffset(x: number, y: number, controls: readonly Control[]): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;
  for (const c of controls) {
    const d2 = (x - c.at.x) ** 2 + (y - c.at.y) ** 2;
    const w = Math.exp(-d2 / (2 * c.sigma * c.sigma));
    dx += c.dx * w;
    dy += c.dy * w;
  }
  return { dx: -dx, dy: -dy };
}

/** Gaussian-feathered ellipse weight in [0, 1]. */
export function ellipseWeight(x: number, y: number, r: ToneRegion): number {
  const q = ((x - r.center.x) / r.rx) ** 2 + ((y - r.center.y) / r.ry) ** 2;
  return Math.exp(-q * 1.5);
}

/** Separable box blur on a single channel (in place safe: returns a new array). */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src.slice();
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[y * w + Math.min(w - 1, Math.max(0, k))]!;
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / n;
      acc += src[y * w + Math.min(w - 1, x + r + 1)]! - src[y * w + Math.max(0, x - r)]!;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x]!;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / n;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x]! - tmp[Math.max(0, y - r) * w + x]!;
    }
  }
  return out;
}
