import { LM } from '../analysis/landmarks';
import { lerp } from '../analysis/geometry';
import type { LuminanceSampler, Point } from '../analysis/types';

export type Gray = { data: Float32Array; width: number; height: number };
export type Rect = { x: number; y: number; w: number; h: number };

/** Rec. 601 luma from RGBA bytes. */
export function toGray(rgba: ArrayLike<number>, width: number, height: number): Gray {
  const data = new Float32Array(width * height);
  for (let i = 0, j = 0; i < data.length; i++, j += 4) data[i] = 0.299 * rgba[j]! + 0.587 * rgba[j + 1]! + 0.114 * rgba[j + 2]!;
  return { data, width, height };
}

const clampRect = (r: Rect, g: Gray): Rect => {
  const x = Math.max(0, Math.floor(r.x));
  const y = Math.max(0, Math.floor(r.y));
  return { x, y, w: Math.max(0, Math.min(g.width - x, Math.ceil(r.w))), h: Math.max(0, Math.min(g.height - y, Math.ceil(r.h))) };
};

export function meanInRect(g: Gray, rect: Rect): number {
  const r = clampRect(rect, g);
  let s = 0;
  let n = 0;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++, n++) s += g.data[y * g.width + x]!;
  return n ? s / n : 0;
}

/** Mean luminance of everything outside rect. */
export function meanOutsideRect(g: Gray, rect: Rect): number {
  const r = clampRect(rect, g);
  let s = 0;
  let n = 0;
  for (let y = 0; y < g.height; y++)
    for (let x = 0; x < g.width; x++) {
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) continue;
      s += g.data[y * g.width + x]!;
      n++;
    }
  return n ? s / n : 0;
}

/** Variance of the 4-neighbour Laplacian inside rect (sharpness). */
export function laplacianVariance(g: Gray, rect: Rect): number {
  const r = clampRect(rect, g);
  const vals: number[] = [];
  for (let y = Math.max(1, r.y); y < Math.min(g.height - 1, r.y + r.h); y++)
    for (let x = Math.max(1, r.x); x < Math.min(g.width - 1, r.x + r.w); x++) {
      const i = y * g.width + x;
      vals.push(g.data[i - 1]! + g.data[i + 1]! + g.data[i - g.width]! + g.data[i + g.width]! - 4 * g.data[i]!);
    }
  if (!vals.length) return 0;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  return vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length;
}

export function bbox(points: readonly Point[]): Rect {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function sampler(g: Gray): LuminanceSampler {
  return (x, y) => {
    const xi = Math.min(g.width - 1, Math.max(0, Math.round(x)));
    const yi = Math.min(g.height - 1, Math.max(0, Math.round(y)));
    return g.data[yi * g.width + xi]!;
  };
}

/** Image statistics used by QC. `landmarks` in the same pixel space as `g`. */
export function faceStats(g: Gray, landmarks: readonly Point[] | null) {
  if (!landmarks) {
    const all = { x: 0, y: 0, w: g.width, h: g.height };
    return { faceHeightRatio: null, faceLum: meanInRect(g, all), cheekDiff: null, blur: laplacianVariance(g, all), backlight: null };
  }
  const box = bbox(landmarks.slice(0, 468));
  const cheek = (side: 'R' | 'L'): Rect => {
    const c = lerp(landmarks[side === 'R' ? LM.zygionR : LM.zygionL]!, landmarks[side === 'R' ? LM.alarR : LM.alarL]!, 0.5);
    const s = box.w * 0.08;
    return { x: c.x - s, y: c.y - s, w: 2 * s, h: 2 * s };
  };
  const lr = meanInRect(g, cheek('R'));
  const ll = meanInRect(g, cheek('L'));
  const faceLum = meanInRect(g, box);
  const grow = { x: box.x - box.w * 0.15, y: box.y - box.h * 0.15, w: box.w * 1.3, h: box.h * 1.3 };
  return {
    faceHeightRatio: box.h / g.height,
    faceLum,
    cheekDiff: Math.max(lr, ll) > 0 ? Math.abs(lr - ll) / Math.max(lr, ll) : 0,
    blur: laplacianVariance(g, box),
    backlight: faceLum > 0 ? meanOutsideRect(g, grow) / faceLum : null,
  };
}
