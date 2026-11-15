import { boxBlur3 } from './blur';

/**
 * Band smoothing (docs/PRD.md §5.4, prompts/SUPERPROMPT.md). The image is split into six layers:
 *   fine  = I − LP1    skin texture, pores
 *   band1 = LP1 − LP2  fine lines
 *   band2 = LP2 − LP3  folds
 *   band3 = LP3 − LP4  broad shadows: hollows, the shading of a deep fold
 *   band4 = LP4 − LP5  the widest shadows: a tear trough or a fold seen as a whole
 *   base  = LP5        overall shading, never changed
 * Each layer is turned down by its own amount inside a region mask and the layers are added back.
 *
 * The PRD describes four layers (no band3). Measured on a synthetic dark line, those four with the PRD
 * coefficients remove at most 58 % of its contrast (the engine's own acceptance test asks for 60 %), and a
 * shadow as wide as an under-eye hollow sits almost entirely in the base, where nothing could reach it.
 * Hence the extra layer and higher band2/band3 coefficients. Approved by the owner on 2026-11-15 and recorded in
 * PRD §5.4; the fine type's band2/band3 were raised once more after a real photo showed broad forehead furrows
 * barely changing. These are engine settings, not clinical values.
 */

/** Blur radii of LP1…LP5 as fractions of the face width. The first three are from PRD §5.4. */
export const BAND_RADII = [0.006, 0.02, 0.05, 0.12, 0.25] as const;

export type SmoothType = 'fine' | 'deep' | 'hollow';

/**
 * How much of each layer a smoothing type removes at full strength.
 * `fine` (pores, skin grain) is never touched and band1 only partly: removing them is what made the skin look
 * plastic on real photos (owner review 2026-11-15). The visible part of a line, fold or hollow is its shadow,
 * which sits in band2…band4; those are removed almost completely.
 */
export const SMOOTH_COEFFICIENTS: Record<SmoothType, Coefficients> = {
  fine: { fine: 0, band1: 0.75, band2: 0.95, band3: 0.6, band4: 0 },
  deep: { fine: 0, band1: 0.5, band2: 1, band3: 0.9, band4: 0.6 },
  hollow: { fine: 0, band1: 0.3, band2: 1, band3: 1, band4: 0.85 },
};

export interface Coefficients {
  fine: number;
  band1: number;
  band2: number;
  band3: number;
  band4: number;
}

/**
 * A pixel may get brighter by the full amount (the shadow of a line or fold lifts) but darker by only this
 * share, so highlights and raised skin are not flattened. Source: SUPERPROMPT (0.4 for the positive component).
 * It is applied to the net change of the pixel rather than to each band: attenuating the dark and bright
 * lobes of one band by different amounts leaves a bright rim beside the line.
 */
export const HIGHLIGHT_KEEP = 0.4;

/** Below this share of skin in a blur window, a low-pass is the plain average instead of the skin average. */
const MIN_SKIN_WEIGHT = 0.05;

export interface Decomposition {
  width: number;
  height: number;
  /** RGBA source pixels. */
  src: Uint8ClampedArray;
  /** RGB, 3 bytes per pixel. Stored as bytes to keep memory low; the layers still add back to `src` exactly. */
  lp1: Uint8ClampedArray;
  lp2: Uint8ClampedArray;
  lp3: Uint8ClampedArray;
  lp4: Uint8ClampedArray;
  lp5: Uint8ClampedArray;
}

/** Per-pixel attenuation of the four adjustable layers, 0…1, for the whole working image. */
export interface Attenuation {
  fine: Float32Array;
  band1: Float32Array;
  band2: Float32Array;
  band3: Float32Array;
  band4: Float32Array;
}

/**
 * Splits the picture into its layers. With `skin` (0…1 per pixel), every low-pass is a weighted average over skin
 * only (normalised convolution): eyes, brows, lips, hair and background do not darken the level a shadow is
 * compared with. Without it, the dark eye beside an under-eye hollow made the hollow look no darker than its
 * surroundings, and it was hardly lifted (owner review 2026-11-15). The layers still add back to `src` exactly.
 */
export function decompose(src: Uint8ClampedArray, width: number, height: number, faceWidthPx: number, skin?: Float32Array): Decomposition {
  const n = width * height;
  const lps = BAND_RADII.map(() => new Uint8ClampedArray(n * 3));
  const radii = BAND_RADII.map((radius) => Math.max(1, radius * faceWidthPx));
  const weights = skin ? radii.map((r) => boxBlur3(skin, width, height, r)) : null;
  const channel = new Float32Array(n);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) channel[i] = src[i * 4 + c]!;
    const plain = skin ? null : channel;
    const weighted = skin ? channel.map((v, i) => v * skin[i]!) : null;
    radii.forEach((radius, k) => {
      const lp = lps[k]!;
      if (plain) {
        const blurred = boxBlur3(plain, width, height, radius);
        for (let i = 0; i < n; i++) lp[i * 3 + c] = blurred[i]!;
        return;
      }
      const num = boxBlur3(weighted!, width, height, radius);
      const den = weights![k]!;
      // Where there is almost no skin nearby, fall back to the plain average.
      let fallback: Float32Array | null = null;
      for (let i = 0; i < n; i++) {
        const d = den[i]!;
        if (d >= MIN_SKIN_WEIGHT) lp[i * 3 + c] = num[i]! / d;
        else lp[i * 3 + c] = (fallback ??= boxBlur3(channel, width, height, radius))[i]!;
      }
    });
  }
  return { width, height, src, lp1: lps[0]!, lp2: lps[1]!, lp3: lps[2]!, lp4: lps[3]!, lp5: lps[4]! };
}

export const newAttenuation = (pixels: number): Attenuation => ({
  fine: new Float32Array(pixels),
  band1: new Float32Array(pixels),
  band2: new Float32Array(pixels),
  band3: new Float32Array(pixels),
  band4: new Float32Array(pixels),
});

/**
 * Writes the smoothed pixels of the box [x0, x1) × [y0, y1) into `out` (RGBA, same size as the source).
 * Pixels with no attenuation are left as they are in `out`.
 */
export function compose(dec: Decomposition, att: Attenuation, out: Uint8ClampedArray, x0: number, y0: number, x1: number, y1: number): void {
  const { width, src, lp1, lp2, lp3, lp4, lp5 } = dec;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * width + x;
      const af = att.fine[i]!;
      const a1 = att.band1[i]!;
      const a2 = att.band2[i]!;
      const a3 = att.band3[i]!;
      const a4 = att.band4[i]!;
      if (af <= 0 && a1 <= 0 && a2 <= 0 && a3 <= 0 && a4 <= 0) continue;
      const s = i * 4;
      const l = i * 3;
      for (let c = 0; c < 3; c++) {
        const v = src[s + c]!;
        const p1 = lp1[l + c]!;
        const p2 = lp2[l + c]!;
        const p3 = lp3[l + c]!;
        const p4 = lp4[l + c]!;
        const p5 = lp5[l + c]!;
        const smoothed = p5 + (p4 - p5) * (1 - a4) + (p3 - p4) * (1 - a3) + (p2 - p3) * (1 - a2) + (p1 - p2) * (1 - a1) + (v - p1) * (1 - af);
        // A shadow is lifted at most to the level of its surroundings; without this the skin right beside
        // a softened line comes out a few levels too bright.
        const change = Math.min(smoothed, Math.max(v, p1, p2, p3, p4, p5)) - v;
        out[s + c] = v + (change > 0 ? change : change * HIGHLIGHT_KEEP);
      }
    }
  }
}
