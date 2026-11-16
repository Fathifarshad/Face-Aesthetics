/**
 * Ordering of treatment options (PRD F5.2, F5.5, F5.6). Pure functions: no React, no DOM.
 */
import { optionById, optionsOf, type OpenRange, type Range, type TreatmentOption } from './treatmentOptions';
import type { ConcernId } from './types';

/** PRD F5.2: result, lower cost, faster onset, durability, less downtime. */
export const SORT_KEYS = ['result', 'cost', 'onset', 'durability', 'downtime'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** PRD F5.6: from this midface volume grade the cheek is supported first. */
export const SUPPORT_FROM_GRADE = 2;

/**
 * Options of a concern in their default order (PRD §6), with «اول حمایت، بعد چین» (F5.6): the cheek-support option
 * leads only when the midface volume grade is 2 or more; otherwise it goes last. The result rank (`efficacy`)
 * follows this order (owner decision 2026-11-16).
 */
export function defaultOrder(concernId: ConcernId, midfaceGrade: number): TreatmentOption[] {
  const all = optionsOf(concernId);
  const support = all.filter((o) => o.support);
  const rest = all.filter((o) => !o.support);
  const ordered = midfaceGrade >= SUPPORT_FROM_GRADE ? [...support, ...rest] : [...rest, ...support];
  return ordered.map((o, i) => ({ ...o, efficacy: Math.max(1, 5 - i) }));
}

const mid = (r: Range | null) => (r ? (r.min + r.max) / 2 : null);
const midOpen = (r: OpenRange | null) => (r ? (r.max === null ? r.min : (r.min + r.max) / 2) : null);

/** Sort value, smaller first; null = not known, always last. `cost`: the tariff cost when every option has one. */
function value(o: TreatmentOption, key: SortKey, cost?: (o: TreatmentOption) => number | null): number | null {
  switch (key) {
    case 'result':
      return -o.efficacy;
    case 'cost':
      return cost ? cost(o) : o.costTier;
    case 'onset':
      return mid(o.onsetDays);
    case 'durability': {
      const v = midOpen(o.durationMonths);
      return v === null ? null : -v;
    }
    case 'downtime':
      return mid(o.downtimeDays);
  }
}

/**
 * Sorted copy; ties and unknown values keep the given (default) order. `cost` gives the clinic-tariff cost of an
 * option (PRD F7.4); it is used only when every option has one, otherwise the relative cost tier sorts.
 */
export function sortOptions(
  options: readonly TreatmentOption[],
  key: SortKey,
  cost?: (o: TreatmentOption) => number | null,
): TreatmentOption[] {
  const byTariff = cost && options.every((o) => cost(o) !== null) ? cost : undefined;
  return options
    .map((o, i) => ({ o, i, v: value(o, key, byTariff) }))
    .sort((a, b) => {
      if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1;
      return a.v - b.v || a.i - b.i;
    })
    .map((x) => x.o);
}

/**
 * The option in force for a concern: the doctor's choice when it belongs to the concern and is allowed, else the
 * first allowed option in default order; null when every option is contraindicated (`allowed`: intake checks).
 */
export function chosenOption(
  concernId: ConcernId,
  chosenId: string | undefined,
  midfaceGrade: number,
  allowed: (o: TreatmentOption) => boolean = () => true,
): TreatmentOption | null {
  const order = defaultOrder(concernId, midfaceGrade).filter(allowed);
  const own = chosenId ? optionById(chosenId) : undefined;
  return (own && order.find((o) => o.id === own.id)) ?? order[0] ?? null;
}

/**
 * Session order of PRD F5.5: toxin, then structural filler (temple, cheek, chin, jaw), then the fine areas
 * (under-eye, lips and the other folds), then biostimulators, threads, skin treatments and devices.
 */
export type SessionStage = 1 | 2 | 3 | 4;
const STRUCTURAL: ReadonlySet<ConcernId> = new Set<ConcernId>(['temple', 'midface-volume', 'chin', 'jawline']);

export function sessionStage(o: TreatmentOption): SessionStage {
  if (o.modality === 'toxin') return 1;
  if (o.modality === 'filler') return o.support || STRUCTURAL.has(o.concernId) ? 2 : 3;
  return 4;
}

/** Chosen options grouped into sessions in F5.5 order; empty stages are left out. */
export function sessionsOf(options: readonly TreatmentOption[]): { stage: SessionStage; options: TreatmentOption[] }[] {
  return ([1, 2, 3, 4] as const)
    .map((stage) => ({ stage, options: options.filter((o) => sessionStage(o) === stage) }))
    .filter((s) => s.options.length > 0);
}
