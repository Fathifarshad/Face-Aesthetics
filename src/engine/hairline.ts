import { buildFrame, toFace, toPx } from './faceFrame';
import { L_BROW_UPPER, R_BROW_UPPER } from './landmarks';
import type { Pt } from './types';

/** RGBA pixels of the working image (an ImageData fits). */
export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Settings of the hairline search, in face units unless noted. The mesh stops below the hairline, so the
 * upper edge of the forehead is found in the image: from above each brow, walk up until the colour stops
 * looking like the skin just above that brow.
 */
export const HAIRLINE = {
  columns: 15,
  startAboveBrow: 0.07,
  step: 0.012,
  /** Never look further than this above the brow (a bald head has no hairline to find). */
  maxRise: 0.75,
  /** Half-size of the sampled patch. */
  patch: 0.012,
  /** Steps averaged into the skin reference of a column. */
  referenceSteps: 4,
  /** Non-skin when this much darker than the reference (hair, shadow under a scarf). */
  darker: 0.7,
  /**
   * At a soft hairline the brightness fades slowly, but hair is textured long before it is that dark:
   * non-skin when darker than this share of the reference and the brightness spread inside the patch is
   * above `textureFactor` × that of the reference, within [textureMin, textureMax] grey levels.
   * Measured 2026-11-15 on the test photos: forehead skin 1–2.5, hair 4.5–11.
   */
  texturedDarker: 0.88,
  textureFactor: 2,
  textureMin: 4,
  textureMax: 6,
  /** A column whose reference is darker than this share of the median reference starts in hair (brow tail under a fringe). */
  referenceFloor: 0.75,
  /** Non-skin when the hue has moved this far (Cb/Cr distance) without being brighter (grey hair, fabric). */
  chroma: 16,
  /** A brighter patch is skin shine unless it is almost colourless (white hair, wall). */
  shine: 1.1,
  chromaWhenBright: 30,
  /** Consecutive non-skin steps needed, so a forehead line or a mole does not end the search. */
  confirm: 3,
  /** Steps needed when only the texture rule fires: a deep forehead line is textured too, but hair goes on much longer. */
  confirmTextured: 6,
  /** Stay this far below the detected edge. */
  margin: 0.025,
} as const;

type Colour = { y: number; cb: number; cr: number; /** Standard deviation of brightness inside the patch. */ sd: number };

function patchColour(px: Pixels, at: Pt, radius: number): Colour | null {
  const x0 = Math.round(at.x - radius);
  const y0 = Math.round(at.y - radius);
  const x1 = Math.round(at.x + radius);
  const y1 = Math.round(at.y + radius);
  if (x0 < 0 || y0 < 0 || x1 >= px.width || y1 >= px.height) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  let yy = 0;
  let n = 0;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = (y * px.width + x) * 4;
      r += px.data[i]!;
      g += px.data[i + 1]!;
      b += px.data[i + 2]!;
      const l = 0.299 * px.data[i]! + 0.587 * px.data[i + 1]! + 0.114 * px.data[i + 2]!;
      yy += l * l;
      n++;
    }
  r /= n;
  g /= n;
  b /= n;
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  return { y, cb: 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, cr: 128 + 0.5 * r - 0.418688 * g - 0.081312 * b, sd: Math.sqrt(Math.max(0, yy / n - y * y)) };
}

/** 'skin', clearly not skin ('other'), or only darker and textured ('textured': hair, or a deep line). */
function classify(c: Colour, ref: Colour): 'skin' | 'other' | 'textured' {
  const H = HAIRLINE;
  if (c.y < H.darker * ref.y) return 'other';
  const drift = Math.hypot(c.cb - ref.cb, c.cr - ref.cr);
  if (!(c.y > H.shine * ref.y ? drift <= H.chromaWhenBright : drift <= H.chroma)) return 'other';
  const texture = Math.min(H.textureMax, Math.max(H.textureMin, H.textureFactor * ref.sd));
  return c.y < H.texturedDarker * ref.y && c.sd > texture ? 'textured' : 'skin';
}

const median3 = (a: number, b: number, c: number) => a + b + c - Math.min(a, b, c) - Math.max(a, b, c);

/**
 * Upper edge of the forehead, as points in face coordinates ordered from the subject's right brow tail
 * to the left one. Returns null when it cannot be measured (brows out of frame).
 */
export function detectHairline(px: Pixels, lm: readonly Pt[]): Pt[] | null {
  const H = HAIRLINE;
  const frame = buildFrame(lm);
  // Upper brow edge as one polyline across the face, left to right in face x.
  const brow = [...R_BROW_UPPER, ...[...L_BROW_UPPER].reverse()].map((i) => toFace(frame, lm[i]!)).sort((a, b) => a.x - b.x);
  const browY = (x: number): number => {
    for (let i = 0; i < brow.length - 1; i++) {
      const a = brow[i]!;
      const b = brow[i + 1]!;
      if (x >= a.x && x <= b.x) return a.y + ((x - a.x) / Math.max(1e-9, b.x - a.x)) * (b.y - a.y);
    }
    return x < brow[0]!.x ? brow[0]!.y : brow[brow.length - 1]!.y;
  };
  const x0 = brow[0]!.x;
  const x1 = brow[brow.length - 1]!.x;
  const radius = Math.max(1, H.patch * frame.unit);
  const maxSteps = Math.floor(H.maxRise / H.step);

  const columns: { x: number; start: number; at: (s: number) => Colour | null; ref: Colour }[] = [];
  for (let k = 0; k < H.columns; k++) {
    const x = x0 + ((x1 - x0) * k) / (H.columns - 1);
    const start = browY(x) - H.startAboveBrow;
    const at = (s: number) => patchColour(px, toPx(frame, { x, y: start - s * H.step }), radius);
    const refs = Array.from({ length: H.referenceSteps }, (_, s) => at(s)).filter((c): c is Colour => c !== null);
    if (refs.length === 0) return null;
    const mean = (f: (c: Colour) => number) => refs.reduce((t, c) => t + f(c), 0) / refs.length;
    columns.push({ x, start, at, ref: { y: mean((c) => c.y), cb: mean((c) => c.cb), cr: mean((c) => c.cr), sd: mean((c) => c.sd) } });
  }
  const sortedY = columns.map((c) => c.ref.y).sort((a, b) => a - b);
  const typicalY = sortedY[Math.floor(sortedY.length / 2)]!;

  const tops: number[] = [];
  for (const { start, at, ref } of columns) {
    // The column starts in hair: the forehead ends right above the brow here.
    if (ref.y < H.referenceFloor * typicalY) {
      tops.push(start + H.margin);
      continue;
    }

    let lastSkin = H.referenceSteps - 1;
    let misses = 0;
    let textured = 0;
    for (let s = H.referenceSteps; s <= maxSteps; s++) {
      const c = at(s);
      if (c === null) break; // image edge
      const kind = classify(c, ref);
      if (kind === 'skin') {
        lastSkin = s;
        misses = 0;
        textured = 0;
        continue;
      }
      // Both kinds count towards the textured run; only clear non-skin counts towards the short one.
      textured++;
      if (kind === 'other') misses++;
      if (misses >= H.confirm || textured >= H.confirmTextured) break;
    }
    tops.push(start - lastSkin * H.step + H.margin);
  }

  // One stray column (a lock of hair, a highlight) should not dent the edge.
  const smooth = tops.map((t, i) => median3(tops[Math.max(0, i - 1)]!, t, tops[Math.min(tops.length - 1, i + 1)]!));
  return smooth.map((y, k) => ({ x: x0 + ((x1 - x0) * k) / (H.columns - 1), y }));
}
