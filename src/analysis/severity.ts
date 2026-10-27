import type { Norm } from './norms';
import type { Severity } from './types';

/** Deviation in tolerance units: from the reference point, or from the nearest edge of the range. */
export function deviation(value: number, norm: Norm): number | null {
  if (norm.descriptive) return null;
  if (norm.range) {
    const [lo, hi] = norm.range;
    const outside = value < lo ? lo - value : value > hi ? value - hi : 0;
    return outside / norm.tolerance;
  }
  if (norm.reference === undefined) return null;
  return Math.abs(value - norm.reference) / norm.tolerance;
}

/** docs/ANALYSIS_SPEC.md §4: 0 if d < 0.5, 1 if < 1, 2 if < 1.5, 3 if < 2, 4 otherwise. */
export function severityFromDeviation(d: number): Severity {
  if (d < 0.5) return 0;
  if (d < 1) return 1;
  if (d < 1.5) return 2;
  if (d < 2) return 3;
  return 4;
}

/** Grade from ascending thresholds [g1, g2, g3, g4]. */
export function gradeFromThresholds(value: number, thresholds: readonly number[]): Severity {
  let g = 0;
  for (const t of thresholds) if (value >= t) g++;
  return Math.min(4, g) as Severity;
}
