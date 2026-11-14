import {
  ANCHOR,
  FACE_OVAL,
  L_BROW_LOWER,
  L_BROW_UPPER,
  L_EYE_LOWER,
  L_EYE_UPPER,
  L_NASOLABIAL,
  L_NOSTRIL,
  LANDMARK_COUNT,
  LIPS_INNER_LOWER,
  LIPS_INNER_UPPER,
  LIPS_OUTER_LOWER,
  LIPS_OUTER_UPPER,
  R_BROW_LOWER,
  R_BROW_UPPER,
  R_EYE_LOWER,
  R_EYE_UPPER,
  R_NASOLABIAL,
  R_NOSTRIL,
} from './landmarks';
import type { Pt } from './types';

/** Frame of the synthetic face: eye line horizontal at y = 400, outer eye corners 200 px apart. */
export const FIXTURE = { origin: { x: 500, y: 400 }, unit: 200, width: 1000, height: 1000 } as const;

/**
 * Synthetic, exactly left/right-symmetric frontal face for engine tests. No real person.
 * Built in face units (see faceFrame.ts) and placed in a 1000 × 1000 px image. Only the points of the
 * standard sets in landmarks.ts are meaningful; all other mesh points sit at the nose tip.
 */
export function syntheticMesh(): Pt[] {
  const noseTip = { x: 0, y: 0.42 };
  const face: Pt[] = Array.from({ length: LANDMARK_COUNT }, () => ({ ...noseTip }));
  const set = (i: number, x: number, y: number) => (face[i] = { x, y });
  /** Places a right-side set and its mirrored left-side set from one curve, t = 0 (outer) … 1 (inner). */
  const pair = (right: readonly number[], left: readonly number[], at: (t: number) => Pt) =>
    right.forEach((ri, k) => {
      const p = at(k / (right.length - 1));
      set(ri, p.x, p.y);
      set(left[k]!, -p.x, p.y);
    });

  // Face outline: ellipse, one point every 10°, clockwise from the top toward the subject's left.
  FACE_OVAL.forEach((i, k) => {
    const a = (k / FACE_OVAL.length) * Math.PI * 2;
    set(i, 0.78 * Math.sin(a), 0.3 - 1.05 * Math.cos(a));
  });

  const arc = (x0: number, x1: number, y0: number, y1: number, bulge: number) => (t: number) => ({
    x: x0 + (x1 - x0) * t,
    y: y0 + (y1 - y0) * t + bulge * Math.sin(Math.PI * t),
  });
  pair(R_EYE_LOWER, L_EYE_LOWER, arc(-0.5, -0.17, 0, 0.02, 0.05));
  pair(R_EYE_UPPER, L_EYE_UPPER, arc(-0.5, -0.17, 0, 0.02, -0.07));
  pair(R_BROW_UPPER, L_BROW_UPPER, arc(-0.58, -0.14, -0.17, -0.2, -0.07));
  pair(R_BROW_LOWER, L_BROW_LOWER, arc(-0.58, -0.14, -0.11, -0.14, -0.07));

  // Nasolabial fold: from beside the nose wing to outside and below the mouth corner.
  pair(R_NASOLABIAL, L_NASOLABIAL, (t) => ({ x: -0.27 - 0.17 * t, y: 0.47 + 0.39 * t }));
  // Nostril: a small ring at the base of the nose.
  R_NOSTRIL.forEach((ri, k) => {
    const a = (k / R_NOSTRIL.length) * Math.PI * 2;
    set(ri, -0.11 + 0.05 * Math.cos(a), 0.5 + 0.025 * Math.sin(a));
    set(L_NOSTRIL[k]!, 0.11 - 0.05 * Math.cos(a), 0.5 + 0.025 * Math.sin(a));
  });

  // Lips: sets run from the right mouth corner to the left one.
  const lip = (ids: readonly number[], bulge: number) =>
    ids.forEach((i, k) => {
      const t = k / (ids.length - 1);
      set(i, -0.27 + 0.54 * t, 0.78 + bulge * Math.sin(Math.PI * t));
    });
  lip(LIPS_OUTER_UPPER, -0.08);
  lip(LIPS_OUTER_LOWER, 0.12);
  lip(LIPS_INNER_UPPER, -0.01);
  lip(LIPS_INNER_LOWER, 0.01);

  set(ANCHOR.noseTip, noseTip.x, noseTip.y);
  set(ANCHOR.subnasale, 0, 0.52);
  set(ANCHOR.nasion, 0, -0.02);
  set(ANCHOR.glabella, 0, -0.15);

  return face.map((q) => ({ x: FIXTURE.origin.x + q.x * FIXTURE.unit, y: FIXTURE.origin.y + q.y * FIXTURE.unit }));
}

/**
 * Synthetic picture of the synthetic face for the hairline search: skin colour below `hairlineY`
 * (face units, negative = above the eye line), dark "hair" above it. A plain RGBA buffer, no real image.
 */
export function syntheticPicture(hairlineY: number): { data: Uint8ClampedArray; width: number; height: number } {
  const { width, height } = FIXTURE;
  const data = new Uint8ClampedArray(width * height * 4);
  const edge = FIXTURE.origin.y + hairlineY * FIXTURE.unit;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const skin = y >= edge;
      data[i] = skin ? 205 : 40;
      data[i + 1] = skin ? 160 : 32;
      data[i + 2] = skin ? 135 : 30;
      data[i + 3] = 255;
    }
  return { data, width, height };
}

/** Rotates (degrees), scales and shifts pixel points about the image centre — a photo taken differently. */
export function transformed(points: readonly Pt[], opts: { deg?: number; scale?: number; dx?: number; dy?: number; mirror?: boolean }): Pt[] {
  const { deg = 0, scale = 1, dx = 0, dy = 0, mirror = false } = opts;
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  return points.map((p) => {
    const x = (mirror ? -1 : 1) * (p.x - 500);
    const y = p.y - 500;
    return { x: 500 + (x * c - y * s) * scale + dx, y: 500 + (x * s + y * c) * scale + dy };
  });
}
