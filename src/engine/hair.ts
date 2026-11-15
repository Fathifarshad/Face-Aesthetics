import { boxBlur3 } from './blur';

/**
 * Dark hair inside the face (moustache, beard, a fringe over the forehead) is kept out of smoothing: band
 * smoothing reads hair as deep lines and would wash it into a blur.
 *
 * A pixel counts as hair when it is much darker than the reference skin (the cheeks) **and** rough: hair is
 * made of strands, so its brightness changes from pixel to pixel. The shadow of a deep crease can be as dark
 * as hair on a brightly lit face, but it is smooth; without the roughness test it was protected, left dark
 * while the skin around it was lifted, and showed as a dark patch (owner review 2026-11-15). Single dark pixels
 * (pores, a fine line) are dropped by a local majority vote; what remains is grown slightly and given a
 * soft edge so the skin right beside the hair is not pulled darker either.
 *
 * Limit: hair that is about as light as the skin (blond, grey, fine stubble) is not found.
 */

/** Hair is darker than this share of the reference skin luminance. Engine setting, not a clinical value. */
export const HAIR_DARK = 0.6;
/** Share of dark pixels needed in the neighbourhood for a pixel to count as hair. */
const MAJORITY = 0.45;
/** Hair is at least this many times rougher than the reference skin, and at least TEXTURE_FLOOR levels. */
export const HAIR_ROUGH = 2;
const TEXTURE_FLOOR = 3;

const luma = (data: Uint8ClampedArray, i: number) => 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;

/** Median luminance of the pixels where `where` is above one half. Returns null when there are none. */
export function medianLuma(data: Uint8ClampedArray, where: Float32Array): number | null {
  const histogram = new Uint32Array(256);
  let count = 0;
  for (let i = 0; i < where.length; i++) {
    if (where[i]! <= 0.5) continue;
    histogram[Math.round(luma(data, i))]!++;
    count++;
  }
  if (count === 0) return null;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += histogram[v]!;
    if (seen * 2 >= count) return v;
  }
  return 255;
}

/**
 * Roughness per pixel: mean absolute difference between the luminance and its 1-pixel blur, averaged over
 * `grain` pixels.
 */
export function roughness(data: Uint8ClampedArray, width: number, height: number, grain: number): Float32Array {
  const n = width * height;
  const l = new Float32Array(n);
  for (let i = 0; i < n; i++) l[i] = luma(data, i);
  const near = boxBlur3(l, width, height, 1);
  const dev = new Float32Array(n);
  for (let i = 0; i < n; i++) dev[i] = Math.abs(l[i]! - near[i]!);
  return boxBlur3(dev, width, height, Math.max(1, grain));
}

/** Median of `values` where `where` is above one half; null when there are none. */
function median(values: Float32Array, where: Float32Array): number | null {
  const picked: number[] = [];
  for (let i = 0; i < values.length; i++) if (where[i]! > 0.5) picked.push(values[i]!);
  if (picked.length === 0) return null;
  picked.sort((a, b) => a - b);
  return picked[Math.floor(picked.length / 2)]!;
}

/**
 * Soft hair map (0…1) of an RGBA image. `skin` is the reference skin luminance, `grain` the radius in
 * pixels over which the majority vote is taken, `feather` the radius of the soft edge in pixels.
 * `reference` marks the reference skin (the cheeks) whose roughness hair must exceed; without it only the floor applies.
 * Patches smaller than `minArea` pixels are dropped: moustache, beard and fringe are large, while a cluster of
 * dark wrinkles under the eye is small and must still be smoothed.
 */
export function hairMap(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  skin: number,
  grain: number,
  feather: number,
  reference?: Float32Array,
  minArea = 0,
): Float32Array {
  const n = width * height;
  const dark = new Float32Array(n);
  const limit = HAIR_DARK * skin;
  const rough = roughness(data, width, height, grain);
  const skinRough = reference ? (median(rough, reference) ?? 0) : 0;
  const roughLimit = Math.max(TEXTURE_FLOOR, HAIR_ROUGH * skinRough);
  for (let i = 0; i < n; i++) if (luma(data, i) < limit && rough[i]! >= roughLimit) dark[i] = 1;
  const share = boxBlur3(dark, width, height, Math.max(1, grain));
  const hair = new Float32Array(n);
  for (let i = 0; i < n; i++) if (share[i]! >= MAJORITY) hair[i] = 1;
  if (minArea > 0) dropSmall(hair, width, minArea);
  // Grow by about the feather radius, then soften: values at the old edge reach 1 again after doubling.
  const soft = boxBlur3(hair, width, height, Math.max(1, feather));
  for (let i = 0; i < n; i++) soft[i] = Math.min(1, soft[i]! * 2);
  return soft;
}

/** Clears every 4-connected patch of ones smaller than `minArea` pixels, in place. */
function dropSmall(map: Float32Array, width: number, minArea: number): void {
  const seen = new Uint8Array(map.length);
  const stack: number[] = [];
  const patch: number[] = [];
  for (let start = 0; start < map.length; start++) {
    if (map[start] !== 1 || seen[start]) continue;
    stack.push(start);
    seen[start] = 1;
    patch.length = 0;
    while (stack.length) {
      const i = stack.pop()!;
      patch.push(i);
      const x = i % width;
      const next = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width];
      for (const j of next) {
        if (j < 0 || j >= map.length || seen[j] || map[j] !== 1) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    if (patch.length < minArea) for (const i of patch) map[i] = 0;
  }
}
