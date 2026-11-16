import { ANCHOR } from '../engine/landmarks';

/**
 * Before/after framing (PRD F8.2, F8.5). Uses the outer eye corners only: they do not move with treatment,
 * so they tell how the camera stood, not how the face changed.
 */

type P = { x: number; y: number };
/** A photo with its mesh landmarks in the photo's own pixels. */
export type Framed = { landmarks: readonly P[] | null; width: number; height: number };

/**
 * How far an "after" photo may differ from the "before" photo and still compare fairly.
 * Technical tolerances for framing, not clinical values.
 */
export const FRAME_TOLERANCE = { scale: 0.1, shift: 0.06, angleDeg: 4 } as const;

function eyes(f: Framed): { r: P; l: P } | null {
  const r = f.landmarks?.[ANCHOR.rEyeOuter];
  const l = f.landmarks?.[ANCHOR.lEyeOuter];
  return r && l ? { r, l } : null;
}

/** Eye-line centre and length as fractions of the image width/height, and its angle in degrees. */
function eyeLine(f: Framed): { cx: number; cy: number; len: number; angle: number } | null {
  const e = eyes(f);
  if (!e) return null;
  return {
    cx: (e.r.x + e.l.x) / 2 / f.width,
    cy: (e.r.y + e.l.y) / 2 / f.height,
    len: Math.hypot(e.l.x - e.r.x, e.l.y - e.r.y) / f.width,
    angle: (Math.atan2(e.l.y - e.r.y, e.l.x - e.r.x) * 180) / Math.PI,
  };
}

/** True when the "after" photo is framed like the "before" one; null when a face is missing in either. */
export function frameMatches(before: Framed, after: Framed): boolean | null {
  const b = eyeLine(before);
  const a = eyeLine(after);
  if (!b || !a || b.len === 0) return null;
  return (
    Math.abs(a.len / b.len - 1) <= FRAME_TOLERANCE.scale &&
    Math.hypot(a.cx - b.cx, a.cy - b.cy) <= FRAME_TOLERANCE.shift &&
    Math.abs(a.angle - b.angle) <= FRAME_TOLERANCE.angleDeg
  );
}

/**
 * Similarity transform (scale, rotation, shift) that puts the "after" photo's outer eye corners on the
 * "before" photo's, as `ctx.setTransform(a, b, c, d, e, f)` arguments. Null when a face is missing.
 */
export function alignTransform(before: Framed, after: Framed): [number, number, number, number, number, number] | null {
  const q = eyes(before);
  const p = eyes(after);
  if (!q || !p) return null;
  // Complex form: z' = s·z + t with s = (q.l − q.r) / (p.l − p.r).
  const dx = p.l.x - p.r.x;
  const dy = p.l.y - p.r.y;
  const den = dx * dx + dy * dy;
  if (den === 0) return null;
  const qx = q.l.x - q.r.x;
  const qy = q.l.y - q.r.y;
  const a = (qx * dx + qy * dy) / den;
  const b = (qy * dx - qx * dy) / den;
  const tx = q.r.x - (a * p.r.x - b * p.r.y);
  const ty = q.r.y - (b * p.r.x + a * p.r.y);
  return [a, b, -b, a, tx, ty];
}
