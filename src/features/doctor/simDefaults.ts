import { defaultIntensity } from '../../data/ageNorms';
import type { AgeTarget, ConcernId, Finding } from '../../data/types';
import type { SimSetting } from '../../db/types';

/** A finding feeds the simulation only after the doctor confirmed or edited it (PRD F2.4). */
export const usable = (f: Finding) => f.reviewed === 'confirmed' || f.reviewed === 'edited';

/**
 * Age-appropriate default of one change (PRD F3.1): each side's slider starts at `intensity` of its own grade;
 * the change is on when either side has something to remove. Rejected or unreviewed findings give 0.
 * Sides with the same value keep the mirror on.
 */
export function defaultSetting(concernId: ConcernId, findings: readonly Finding[], realAge: number, target: AgeTarget): SimSetting {
  const of = (side: Finding['side']) => {
    const f = findings.find((x) => x.concernId === concernId && x.side === side);
    return f && usable(f) ? defaultIntensity(concernId, f.grade, realAge, target) : 0;
  };
  const both = findings.some((x) => x.concernId === concernId && x.side === 'both');
  const right = both ? of('both') : of('R');
  const left = both ? right : of('L');
  const round = (v: number) => Math.round(v * 100) / 100;
  return { on: right > 0 || left > 0, value: round(right), left: round(left), mirror: round(right) === round(left), last: 'R' };
}

/** Settings of every available change: the doctor's own where they moved it, the default everywhere else. */
export function effectiveSettings(
  available: readonly ConcernId[],
  findings: readonly Finding[],
  realAge: number,
  target: AgeTarget,
  overrides: Partial<Record<ConcernId, SimSetting>>,
): Partial<Record<ConcernId, SimSetting>> {
  return Object.fromEntries(available.map((id) => [id, overrides[id] ?? defaultSetting(id, findings, realAge, target)]));
}
