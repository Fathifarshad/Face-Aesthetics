import { dist, lineAngleDeg, mean, midpoint, rotate } from './geometry';
import { LM } from './landmarks';
import type { Landmarks, Point } from './types';

/** Population mean horizontal visible iris diameter in adults (docs/ANALYSIS_SPEC.md §3). */
export const IRIS_DIAMETER_MM = 11.7;

export const hasIris = (lm: Landmarks): boolean => lm.length >= 478;

export const eyeCenterR = (lm: Landmarks): Point => midpoint(lm[LM.exocanthionR]!, lm[LM.endocanthionR]!);
export const eyeCenterL = (lm: Landmarks): Point => midpoint(lm[LM.exocanthionL]!, lm[LM.endocanthionL]!);

/** Head roll from the line joining the eye centres, degrees. 0 = level. */
export function rollDeg(lm: Landmarks): number {
  const r = eyeCenterR(lm);
  const l = eyeCenterL(lm);
  const [a, b] = r.x <= l.x ? [r, l] : [l, r];
  return lineAngleDeg(a, b);
}

/** Returns landmarks rotated so the inter-eye line is horizontal (rotation about the eye midpoint). */
export function rollCorrect(lm: Landmarks): Point[] {
  const roll = rollDeg(lm);
  const center = midpoint(eyeCenterR(lm), eyeCenterL(lm));
  return lm.map((p) => rotate(p, center, -roll));
}

/** Horizontal iris diameter in px for one eye: the edge pair with the larger horizontal extent. */
export function irisDiameterPx(lm: Landmarks, edges: readonly number[]): number {
  const [a, b, c, d] = edges.map((i) => lm[i]!);
  const p1 = dist(a!, c!);
  const p2 = dist(b!, d!);
  const h1 = Math.abs(a!.x - c!.x);
  const h2 = Math.abs(b!.x - d!.x);
  return h1 >= h2 ? p1 : p2;
}

/** mm per pixel from mean iris diameter, or null when iris points are unavailable. Use roll-corrected points. */
export function mmPerPx(lm: Landmarks): number | null {
  if (!hasIris(lm)) return null;
  const d = mean([irisDiameterPx(lm, LM.irisEdgesR), irisDiameterPx(lm, LM.irisEdgesL)]);
  return d > 0 ? IRIS_DIAMETER_MM / d : null;
}
