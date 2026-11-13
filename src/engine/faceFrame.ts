import { ANCHOR, LANDMARK_COUNT } from './landmarks';
import type { FaceFrame, Pt } from './types';

/**
 * Builds the face coordinate frame from pixel-space landmarks.
 * Origin: midpoint of the outer eye corners (33, 263). x: from the subject's right eye corner to the left one.
 * y: perpendicular to x, pointing to the chin (so a mirrored photo still has y toward the chin).
 * unit: distance between the two outer eye corners, in pixels.
 * In this frame the subject's right side has negative x: right outer eye corner = (−0.5, 0).
 */
export function buildFrame(lm: readonly Pt[]): FaceFrame {
  if (lm.length < LANDMARK_COUNT - 10) throw new Error(`expected a ${LANDMARK_COUNT}-point face mesh, got ${lm.length} points`);
  const r = lm[ANCHOR.rEyeOuter]!;
  const l = lm[ANCHOR.lEyeOuter]!;
  const chin = lm[ANCHOR.chin]!;
  const unit = Math.hypot(l.x - r.x, l.y - r.y);
  if (!(unit > 1e-6)) throw new Error('outer eye corners coincide; cannot build the face frame');
  const origin = { x: (r.x + l.x) / 2, y: (r.y + l.y) / 2 };
  const xAxis = { x: (l.x - r.x) / unit, y: (l.y - r.y) / unit };
  let yAxis = { x: -xAxis.y, y: xAxis.x };
  if ((chin.x - origin.x) * yAxis.x + (chin.y - origin.y) * yAxis.y < 0) yAxis = { x: -yAxis.x, y: -yAxis.y };
  return { origin, xAxis, yAxis, unit };
}

/** Pixel → face coordinates. */
export function toFace(f: FaceFrame, p: Pt): Pt {
  const dx = p.x - f.origin.x;
  const dy = p.y - f.origin.y;
  return { x: (dx * f.xAxis.x + dy * f.xAxis.y) / f.unit, y: (dx * f.yAxis.x + dy * f.yAxis.y) / f.unit };
}

/** Face coordinates → pixel. */
export function toPx(f: FaceFrame, q: Pt): Pt {
  return {
    x: f.origin.x + (q.x * f.xAxis.x + q.y * f.yAxis.x) * f.unit,
    y: f.origin.y + (q.x * f.xAxis.y + q.y * f.yAxis.y) * f.unit,
  };
}

/** Head roll in the image plane, degrees (0 = eye line horizontal). */
export const rollDeg = (f: FaceFrame): number => (Math.atan2(f.xAxis.y, Math.abs(f.xAxis.x)) * 180) / Math.PI;
