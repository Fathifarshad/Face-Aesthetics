/**
 * Volume, dose and cost estimates of the plan (PRD F7, M7). Pure functions: no React, no DOM.
 *
 * Where each value comes from (nothing here is invented, docs/PRD.md §5.7, §7):
 * - Formula, grade factor and rounding steps: PRD §5.7 and F7.2 (clinical sign-off 2026-11-17, `clinicalReview.ts`).
 * - Base estimates: the knowledge base (`treatmentOptions.ts`, PRD §6). Label doses (OnabotulinumtoxinA, PRD §7.1)
 *   are shown as on the label and never scaled: a scaled label dose would be a number no source gives.
 * - Toxin numbers only for OnabotulinumtoxinA; other brands get no automatic number (PRD §7.1, last paragraph).
 * - MD Codes per-code range: 0 to the bolus cap × slider; caps 0.3 mL per compartment, 0.5 mL for temple and
 *   mandible angle (PMID 32445044, PRD §7.1). The slider → volume mapping is an owner decision of 2026-11-16,
 *   approved with the clinical sign-off of 2026-11-17.
 * - Tariff, syringe size and vial units: the clinic's own settings (F7.4; defaults 1 mL and 100 U, owner 2026-11-16).
 */
import { REVIEWED } from './clinicalReview';
import type { MdCode } from './mdCodes';
import type { Modality, Range, TreatmentOption } from './treatmentOptions';
import type { ConcernId, Grade, Status, Unit } from './types';

/** PRD §5.7 (clinical sign-off 2026-11-17). */
export const GRADE_FACTOR: Readonly<Record<Grade, number>> = { 0: 0, 1: 0.5, 2: 0.75, 3: 1.0, 4: 1.25 };
/** PRD F7.2: filler 0.1 mL, toxin 2 U; threads and sessions are whole numbers. */
export const ROUND_STEP: Readonly<Record<Unit, number>> = { mL: 0.1, U: 2, thread: 1, session: 1 };

export const SRC_FORMULA = `docs/PRD.md §5.7; ${REVIEWED}`;
export const SRC_BOLUS = 'PMID 32445044 (docs/PRD.md §7.1); slider mapping: owner decision 2026-11-16 (draft)';

export type ToxinBrand = 'onabotulinumtoxinA' | 'other';

/** Kinds of filler the clinic prices apart (F7.4 «به تفکیک نوع»). Interface grouping, not a clinical value. */
export const FILLER_TYPES = ['structural', 'soft', 'lip'] as const;
export type FillerType = (typeof FILLER_TYPES)[number];

/** Modalities priced per session (F7.4 «هر جلسهٔ دستگاه»; skin treatments are counted in sessions as well). */
export const SESSION_MODALITIES = ['skinbooster', 'polynucleotide', 'rf-microneedling', 'hifu', 'laser', 'peel'] as const;
export type SessionModality = (typeof SESSION_MODALITIES)[number];

/** Clinic tariff (F7.4). A missing or zero price means «not entered». */
export interface Tariff {
  currency: string;
  filler: Partial<Record<FillerType, number>>;
  toxinUnit?: number;
  thread?: number;
  session: Partial<Record<SessionModality, number>>;
  /** mL per syringe; plan totals count syringes from it (rounded up). */
  syringeMl: number;
  /** Units per toxin vial; plan totals count vials from it (rounded up). */
  vialUnits: number;
}

export const DEFAULT_TARIFF: Tariff = { currency: 'تومان', filler: {}, session: {}, syringeMl: 1, vialUnits: 100 };

const LIP_AREA: ReadonlySet<ConcernId> = new Set<ConcernId>(['lip-volume', 'perioral-lines']);
const SOFT_AREA: ReadonlySet<ConcernId> = new Set<ConcernId>(['tear-trough', 'glabellar-lines']);

/** Lips and perioral lines → lip filler; under-eye and glabella → soft filler; the rest (and cheek support) → structural. */
export function fillerTypeOf(o: TreatmentOption): FillerType {
  if (LIP_AREA.has(o.concernId)) return 'lip';
  if (SOFT_AREA.has(o.concernId) && !o.support) return 'soft';
  return 'structural';
}

/** Unit the doctor enters an estimate in when the knowledge base gives none. */
export function unitOf(o: TreatmentOption): Unit {
  if (o.base) return o.base.unit;
  if (o.modality === 'filler' || o.modality === 'biostimulator') return 'mL';
  if (o.modality === 'toxin') return 'U';
  if (o.modality === 'thread') return 'thread';
  return 'session';
}

const decimals = (step: number) => (Number.isInteger(step) ? 0 : String(step).split('.')[1]!.length);
/** Half up; the epsilon keeps 0.3 × 0.5 = 0.15 from rounding down through binary floating point. */
export const roundTo = (v: number, step: number) => Number((Math.round(v / step + 1e-9) * step).toFixed(decimals(step)));

/** Grade and slider value (0..1) of one side; `both` for a midline concern. */
export type SideInput = { grade: Grade; intensity: number };
export type Sides = { R?: SideInput; L?: SideInput; both?: SideInput };

export interface Estimate {
  unit: Unit;
  perSide: boolean;
  /** Per side when `perSide` (right; `left` set only when the sides differ), else the total. */
  min: number;
  max: number;
  left?: Range;
  /** Allowed label totals (platysma 26, 31 or 36 U). */
  steps?: readonly number[];
  /** As on the label, not scaled (PRD §7.1). */
  label: boolean;
  /** Entered by the doctor (F7.5, «ویرایش پزشک»). */
  overridden: boolean;
  note?: string;
  status: Status;
  source: string;
}

/** Why no number is shown: no base in PRD §6, toxin brand not OnabotulinumtoxinA, or the change is off. */
export type Missing = 'no-base' | 'brand' | 'off';
export type EstimateResult = { ok: true; est: Estimate } | { ok: false; missing: Missing };

/** The doctor's own estimate (F7.5). */
export interface EstimateOverride {
  min: number;
  max: number;
  unit: Unit;
  perSide: boolean;
  note?: string;
}

/**
 * PRD §5.7: base × grade factor × intensity, rounded per F7.2. `brand` undefined = not asked yet: no toxin number.
 * An override of the doctor always wins.
 */
export function estimateOption(o: TreatmentOption, sides: Sides, brand: ToxinBrand | undefined, override?: EstimateOverride): EstimateResult {
  if (override)
    return {
      ok: true,
      est: {
        unit: override.unit,
        perSide: override.perSide,
        min: override.min,
        max: override.max,
        label: false,
        overridden: true,
        ...(override.note ? { note: override.note } : {}),
        status: 'verified',
        source: 'doctor',
      },
    };
  const b = o.base;
  if (!b) return { ok: false, missing: 'no-base' };
  if (o.modality === 'toxin' && brand !== 'onabotulinumtoxinA') return { ok: false, missing: 'brand' };
  const list = [sides.both, sides.R, sides.L].filter((s): s is SideInput => !!s);
  if (!list.some((s) => s.grade > 0 && s.intensity > 0)) return { ok: false, missing: 'off' };

  if (b.label)
    return {
      ok: true,
      est: {
        unit: b.unit,
        perSide: b.perSide,
        min: b.min,
        max: b.max,
        ...(b.steps ? { steps: b.steps } : {}),
        label: true,
        overridden: false,
        status: 'verified',
        source: b.source,
      },
    };

  const step = ROUND_STEP[b.unit];
  const scale = (s: SideInput | undefined): Range => {
    const k = s ? GRADE_FACTOR[s.grade] * s.intensity : 0;
    return { min: roundTo(b.min * k, step), max: roundTo(b.max * k, step) };
  };
  const common = { unit: b.unit, label: false, overridden: false, status: 'verified' as const, source: `${b.source}; ${SRC_FORMULA}` };
  if (b.perSide) {
    const right = scale(sides.both ?? sides.R);
    const left = scale(sides.both ?? sides.L);
    const same = right.min === left.min && right.max === left.max;
    return { ok: true, est: { ...common, perSide: true, ...right, ...(same ? {} : { left }) } };
  }
  // A total for the concern: the stronger side decides.
  const strongest = list.reduce((a, s) => (GRADE_FACTOR[s.grade] * s.intensity > GRADE_FACTOR[a.grade] * a.intensity ? s : a));
  return { ok: true, est: { ...common, perSide: false, ...scale(strongest) } };
}

/** Amount for the whole face: a per-side estimate counts both sides. */
export function totalOf(e: Estimate): Range {
  if (!e.perSide) return { min: e.min, max: e.max };
  const left = e.left ?? { min: e.min, max: e.max };
  const step = ROUND_STEP[e.unit];
  return { min: roundTo(e.min + left.min, step), max: roundTo(e.max + left.max, step) };
}

const positive = (v: number | undefined) => (v !== undefined && Number.isFinite(v) && v > 0 ? v : null);

/** Price of one unit of this option in the clinic tariff; null when not entered. */
export function unitPrice(o: TreatmentOption, unit: Unit, t: Tariff): number | null {
  switch (unit) {
    case 'mL':
      return o.modality === 'filler' ? positive(t.filler[fillerTypeOf(o)]) : null;
    case 'U':
      return positive(t.toxinUnit);
    case 'thread':
      return positive(t.thread);
    case 'session':
      return (SESSION_MODALITIES as readonly Modality[]).includes(o.modality) ? positive(t.session[o.modality as SessionModality]) : null;
  }
}

/** F7.4: cost = estimate × tariff; null when either is missing. */
export function costOf(o: TreatmentOption, e: Estimate, t: Tariff): Range | null {
  const p = unitPrice(o, e.unit, t);
  if (p === null) return null;
  const amount = totalOf(e);
  return { min: Math.round(amount.min * p), max: Math.round(amount.max * p) };
}

export interface PlanTotals {
  fillerMl: Range;
  syringes: Range;
  toxinU: Range;
  vials: Range;
  threads: Range;
  sessions: Range;
  /** Sum of the items with a cost; `costMissing` counts the ones without. */
  cost: Range;
  costMissing: number;
  /** Chosen options with no number (no base, brand or off): «پزشک وارد کند». */
  noEstimate: number;
}

const add = (a: Range, b: Range): Range => ({ min: a.min + b.min, max: a.max + b.max });
const ZERO: Range = { min: 0, max: 0 };

/** F7.3: totals of the chosen options; syringes and vials rounded up from the clinic's sizes. */
export function planTotals(items: readonly { option: TreatmentOption; result: EstimateResult }[], t: Tariff): PlanTotals {
  let fillerMl = ZERO;
  let toxinU = ZERO;
  let threads = ZERO;
  let sessions = ZERO;
  let cost = ZERO;
  let costMissing = 0;
  let noEstimate = 0;
  for (const { option, result } of items) {
    if (!result.ok) {
      noEstimate++;
      costMissing++;
      continue;
    }
    const amount = totalOf(result.est);
    if (result.est.unit === 'mL' && option.modality === 'filler') fillerMl = add(fillerMl, amount);
    if (result.est.unit === 'U') toxinU = add(toxinU, amount);
    if (result.est.unit === 'thread') threads = add(threads, amount);
    if (result.est.unit === 'session') sessions = add(sessions, amount);
    const c = costOf(option, result.est, t);
    if (c) cost = add(cost, c);
    else costMissing++;
  }
  const round = (r: Range, step: number): Range => ({ min: roundTo(r.min, step), max: roundTo(r.max, step) });
  const count = (r: Range, size: number): Range =>
    size > 0 ? { min: Math.ceil(r.min / size - 1e-9), max: Math.ceil(r.max / size - 1e-9) } : ZERO;
  fillerMl = round(fillerMl, ROUND_STEP.mL);
  return {
    fillerMl,
    syringes: count(fillerMl, t.syringeMl),
    toxinU,
    vials: count(toxinU, t.vialUnits),
    threads,
    sessions,
    cost,
    costMissing,
    noEstimate,
  };
}

/** MD Codes bolus cap per code (PMID 32445044): 0.3 mL per compartment, 0.5 mL for temple and mandible angle. */
export const BOLUS_CAP_ML = (code: MdCode): number => (code === 'T1' || code === 'T2' || code === 'Jw1' ? 0.5 : 0.3);

/** Range shown beside an MD Codes slider (owner 2026-11-16): 0 to cap × slider, per side for a two-sided code. */
export const codeRange = (code: MdCode, intensity: number): Range => ({
  min: 0,
  max: roundTo(BOLUS_CAP_ML(code) * Math.max(0, Math.min(1, intensity)), ROUND_STEP.mL),
});
