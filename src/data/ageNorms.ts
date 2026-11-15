/**
 * Target age and the default strength of each change (docs/PRD.md §5.3, F3).
 *
 *   allowed(age) = clamp((age − start) / yearsPerGrade, 0, max)    grade that counts as normal at that age
 *   target       = allowed(target age)                              target age = real age − offset, or typed
 *   intensity    = grade > target ? (grade − target) / grade : 0    0…1, default value of the slider
 *
 * Pure data and arithmetic: no React, no DOM.
 */
import type { AgeOffset, AgeTarget, ConcernId, Grade, Status } from './types';
import { CONCERN_IDS } from './types';

/** PRD F3.2: no effect is applied above 85 %, so the picture never looks artificial. */
export const SAFETY_CEILING = 0.85;

/** The three targets of PRD §5.3, in the order they are offered. */
export const AGE_OFFSETS: readonly AgeOffset[] = [0, 5, 10];

/** A typed target age is kept within these bounds and never above the real age. Not a clinical value. */
export const TARGET_AGE_MIN = 18;

export interface AgeNorm {
  /** Age at which grade 0 stops being the norm. */
  start: number;
  /** Years per grade above `start`. */
  yearsPerGrade: number;
  /** Highest grade that still counts as age-appropriate. */
  max: number;
  status: Status;
  source: string;
}

/**
 * PRD §5.3 gives one linear table (25 → 0, 50 → 2, 62 → 3) and says the coefficients are set per concern (F3.3).
 * Until a senior physician sets them, every concern uses the PRD values.
 */
const PRD_DEFAULT: AgeNorm = {
  start: 25,
  yearsPerGrade: 12.5,
  max: 3,
  status: 'draft', // TODO(clinical): per-concern coefficients to be set by a senior physician (PRD F3.3)
  source: 'docs/PRD.md §5.3 (draft formula, same for all concerns)',
};

export const AGE_NORMS: Record<ConcernId, AgeNorm> = Object.fromEntries(CONCERN_IDS.map((id) => [id, PRD_DEFAULT])) as Record<
  ConcernId,
  AgeNorm
>;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Grade that counts as normal for this concern at this age (continuous, 0…max). */
export function allowed(age: number, norm: AgeNorm = PRD_DEFAULT): number {
  return clamp((age - norm.start) / norm.yearsPerGrade, 0, norm.max);
}

/** Share of the current grade to remove so that it reaches the target; 0 when it is already there. */
export function intensity(grade: Grade, target: number): number {
  return grade > target ? (grade - target) / grade : 0;
}

/** Target age of a target choice; a typed age is kept between TARGET_AGE_MIN and the real age. */
export function targetAgeOf(realAge: number, target: AgeTarget): number {
  if (target.kind === 'offset') return realAge - target.offset;
  return clamp(Math.round(target.age), Math.min(TARGET_AGE_MIN, realAge), realAge);
}

/** Default slider value of one side of a concern: `intensity`, capped at the safety ceiling. */
export function defaultIntensity(concernId: ConcernId, grade: Grade, realAge: number, target: AgeTarget): number {
  const t = allowed(targetAgeOf(realAge, target), AGE_NORMS[concernId]);
  return Math.min(SAFETY_CEILING, intensity(grade, t));
}
