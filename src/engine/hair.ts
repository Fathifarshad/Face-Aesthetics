import { boxBlur3 } from './blur';

/**
 * Dark hair inside the face (moustache, beard, a fringe over the forehead) is kept out of smoothing: band
 * smoothing reads hair as deep lines and would wash it into a blur.
 *
 * A pixel counts as hair when it is much darker than the reference skin (the cheeks). Lines and folds are
 * only a little darker than the skin around them, so they stay below this threshold. Single dark pixels
 * (pores, a fine line) are dropped by a local majority vote; what remains is grown slightly and given a
 * soft edge so the skin right beside the hair is not pulled darker either.
 *
 * Limit: hair that is about as light as the skin (blond, grey, fine stubble) is not found.
 */

/** Hair is darker than this share of the reference skin luminance. Engine setting, not a clinical value. */
export const HAIR_DARK = 0.6;
/** Share of dark pixels needed in the neighbourhood for a pixel to count as hair. */
const MAJORITY = 0.45;

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
 * Soft hair map (0…1) of an RGBA image. `skin` is the reference skin luminance, `grain` the radius in
 * pixels over which the majority vote is taken, `feather` the radius of the soft edge in pixels.
 */
export function hairMap(data: Uint8ClampedArray, width: number, height: number, skin: number, grain: number, feather: number): Float32Array {
  const n = width * height;
  const dark = new Float32Array(n);
  const limit = HAIR_DARK * skin;
  for (let i = 0; i < n; i++) if (luma(data, i) < limit) dark[i] = 1;
  const share = boxBlur3(dark, width, height, Math.max(1, grain));
  const hair = new Float32Array(n);
  for (let i = 0; i < n; i++) if (share[i]! >= MAJORITY) hair[i] = 1;
  // Grow by about the feather radius, then soften: values at the old edge reach 1 again after doubling.
  const soft = boxBlur3(hair, width, height, Math.max(1, feather));
  for (let i = 0; i < n; i++) soft[i] = Math.min(1, soft[i]! * 2);
  return soft;
}
