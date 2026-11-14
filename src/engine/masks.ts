import { boxBlur3 } from './blur';
import type { Pt } from './types';

/** A soft mask (0…1) stored only for its own box inside the working image. */
export interface Mask {
  x: number;
  y: number;
  width: number;
  height: number;
  data: Float32Array;
}

/** Hard polygon fill (even-odd, sampled at pixel centres) into a box whose top-left is (x0, y0). */
export function fillPolygon(poly: readonly Pt[], x0: number, y0: number, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  const xs: number[] = [];
  for (let row = 0; row < height; row++) {
    const y = y0 + row + 0.5;
    xs.length = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k]! - x0 - 0.5));
      const to = Math.min(width - 1, Math.floor(xs[k + 1]! - x0 - 0.5));
      for (let col = from; col <= to; col++) out[row * width + col] = 1;
    }
  }
  return out;
}

/**
 * Soft-edged mask of a polygon given in pixels of the working image. `feather` is the blur radius in pixels;
 * the box is grown so the soft edge is not cut off, and clipped to the image.
 */
export function buildMask(poly: readonly Pt[], bounds: { width: number; height: number }, feather: number): Mask {
  const pad = Math.ceil(feather * 3) + 1;
  const x = Math.max(0, Math.floor(Math.min(...poly.map((p) => p.x))) - pad);
  const y = Math.max(0, Math.floor(Math.min(...poly.map((p) => p.y))) - pad);
  const x1 = Math.min(bounds.width, Math.ceil(Math.max(...poly.map((p) => p.x))) + pad);
  const y1 = Math.min(bounds.height, Math.ceil(Math.max(...poly.map((p) => p.y))) + pad);
  const width = Math.max(0, x1 - x);
  const height = Math.max(0, y1 - y);
  const hard = fillPolygon(poly, x, y, width, height);
  return { x, y, width, height, data: width && height ? boxBlur3(hard, width, height, feather) : hard };
}

/** Writes max(map, mask) into a full-frame map of the given width. */
export function stampMax(map: Float32Array, mapWidth: number, mask: Mask): void {
  for (let row = 0; row < mask.height; row++) {
    const o = (mask.y + row) * mapWidth + mask.x;
    for (let col = 0; col < mask.width; col++) {
      const v = mask.data[row * mask.width + col]!;
      if (v > map[o + col]!) map[o + col] = v;
    }
  }
}

/** Multiplies a mask in place by `allow` and by (1 − `block`), both full-frame maps of the given width. */
export function limitMask(mask: Mask, mapWidth: number, allow: Float32Array | null, block: Float32Array | null): void {
  for (let row = 0; row < mask.height; row++) {
    const o = (mask.y + row) * mapWidth + mask.x;
    for (let col = 0; col < mask.width; col++) {
      const i = row * mask.width + col;
      let v = mask.data[i]!;
      if (allow) v *= allow[o + col]!;
      if (block) v *= 1 - block[o + col]!;
      mask.data[i] = v;
    }
  }
}
