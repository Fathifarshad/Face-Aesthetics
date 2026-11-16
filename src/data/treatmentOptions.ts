/**
 * Knowledge base of PRD §6: the treatment options of each of the 16 concerns, with the fields of PRD §6 (last
 * paragraph). Pure data: no React, no DOM.
 *
 * Where each value comes from (nothing here is invented, docs/PRD.md §7):
 * - Options and their default order, MD Codes family, effect type and base estimate (for grade 3): PRD §6 table.
 *   Only the OnabotulinumtoxinA label doses are verified (PRD §7.1); every other base estimate is a draft (§7.2).
 * - Onset, durability and downtime: the draft timing table of PRD §7.2, per modality. Modalities that table does not
 *   cover (skin booster, polynucleotide, peel) have no timing (null) until a senior physician enters it.
 * - `efficacy` (result rank) follows the default order of PRD §6; `costTier` follows the modality; the image caps
 *   (`fx.maxStrength`) follow the modality, except the two PRD F5.3 examples. All three are owner decisions of
 *   2026-11-16 and stay `draft` (M7 replaces the cost tier with the clinic tariff).
 * - Risk tags: PRD F5.7 (vascular high-risk areas for injectables; high Fitzpatrick for energy-based devices).
 * Not an injection guide: no depth, angle, tool or technique (PRD §3, F6.2).
 */
import type { ConcernId, Status, Unit } from './types';

export type Modality =
  | 'toxin'
  | 'filler'
  | 'skinbooster'
  | 'polynucleotide'
  | 'biostimulator'
  | 'thread'
  | 'rf-microneedling'
  | 'hifu'
  | 'laser'
  | 'peel';

/** Effect on the picture: S = band smoothing, W = warp (shape), SW = both (PRD §6 column «جلوه»). */
export type FxType = 'S' | 'W' | 'SW';

/** PRD F5.7. */
export type OptionRisk = 'vascular' | 'fitzpatrick';

export type Range = { min: number; max: number };
/** A range whose upper end may be open («12 ماه به بالا»). */
export type OpenRange = { min: number; max: number | null };

export interface BaseEstimate extends Range {
  unit: Unit;
  perSide: boolean;
  /** Label doses with a list of allowed totals (platysma 26, 31 or 36 U): shown as that list. */
  steps?: readonly number[];
  status: Status;
  source: string;
}

export interface TreatmentOption {
  id: string;
  concernId: ConcernId;
  modality: Modality;
  nameFa: string;
  nameEn: string;
  /** MD Codes family names only (PRD F6). */
  mdCodes: readonly string[];
  /** For grade 3 (PRD §6). Null where PRD §6 gives no figure for this option. */
  base: BaseEstimate | null;
  onsetDays: Range | null;
  durationMonths: OpenRange | null;
  downtimeDays: Range | null;
  /** 1–5, 5 = best result. */
  efficacy: number;
  /** 1–5, 1 = cheapest. */
  costTier: number;
  fx: { type: FxType; maxStrength: number };
  risks: readonly OptionRisk[];
  contraindications: readonly string[];
  /** This option supports the cheek first (PRD F5.6, «اول حمایت، بعد چین»). */
  support?: true;
  status: Status;
  source: string;
}

const SRC_TABLE = 'docs/PRD.md §6';
const SRC_LABEL = 'FDA label, OnabotulinumtoxinA (docs/PRD.md §7.1)';
const SRC_TIMING = 'docs/PRD.md §7.2 timing table (draft)';

// TODO(clinical): every timing below is the PRD §7.2 draft; a senior physician confirms or corrects it.
type Timing = Pick<TreatmentOption, 'onsetDays' | 'durationMonths' | 'downtimeDays'>;
const NO_TIMING: Timing = { onsetDays: null, durationMonths: null, downtimeDays: null };
export const TIMING: Record<Modality, Timing> = {
  toxin: { onsetDays: { min: 3, max: 7 }, durationMonths: { min: 3, max: 4 }, downtimeDays: { min: 0, max: 0 } },
  filler: { onsetDays: { min: 0, max: 0 }, durationMonths: { min: 6, max: 18 }, downtimeDays: { min: 1, max: 7 } },
  thread: { onsetDays: { min: 0, max: 0 }, durationMonths: { min: 6, max: 18 }, downtimeDays: { min: 3, max: 10 } },
  biostimulator: { onsetDays: { min: 28, max: 84 }, durationMonths: { min: 18, max: 24 }, downtimeDays: { min: 1, max: 3 } },
  'rf-microneedling': { onsetDays: { min: 30, max: 90 }, durationMonths: { min: 6, max: 12 }, downtimeDays: { min: 1, max: 5 } },
  hifu: { onsetDays: { min: 60, max: 90 }, durationMonths: { min: 6, max: 12 }, downtimeDays: { min: 0, max: 2 } },
  laser: { onsetDays: { min: 14, max: 56 }, durationMonths: { min: 12, max: null }, downtimeDays: { min: 5, max: 14 } },
  skinbooster: NO_TIMING,
  polynucleotide: NO_TIMING,
  peel: NO_TIMING,
};

/** Owner decision 2026-11-16: toxin < skin booster (and the like) < filler < biostimulator < thread and devices. */
export const COST_TIER: Record<Modality, number> = {
  toxin: 1,
  skinbooster: 2,
  polynucleotide: 2,
  peel: 2,
  filler: 3,
  biostimulator: 4,
  thread: 5,
  'rf-microneedling': 5,
  hifu: 5,
  laser: 5,
};

/** Owner decision 2026-11-16; toxin 0.85 and skin booster 0.35 are the PRD F5.3 examples. */
export const FX_CAP: Record<Modality, number> = {
  toxin: 0.85,
  filler: 0.85,
  biostimulator: 0.6,
  thread: 0.6,
  'rf-microneedling': 0.5,
  hifu: 0.5,
  laser: 0.5,
  skinbooster: 0.35,
  polynucleotide: 0.35,
  peel: 0.35,
};

const ENERGY: ReadonlySet<Modality> = new Set<Modality>(['rf-microneedling', 'hifu', 'laser']);
/** PRD F5.7: glabella, nose, under-eye, temple, upper nasolabial. */
const VASCULAR: ReadonlySet<ConcernId> = new Set<ConcernId>(['glabellar-lines', 'tear-trough', 'temple', 'nasolabial-fold']);
const INJECTED_VOLUME: ReadonlySet<Modality> = new Set<Modality>(['filler', 'biostimulator']);
/** MD Codes families name filler and toxin sites only. */
const CODED: ReadonlySet<Modality> = new Set<Modality>(['filler', 'toxin']);

type Row = {
  modality: Modality;
  nameFa: string;
  nameEn: string;
  fx: FxType;
  base?: Omit<BaseEstimate, 'status' | 'source'> & { verified?: true };
  /** Overrides the concern's MD Codes family for this option. */
  mdCodes?: readonly string[];
  support?: true;
};

const label = (min: number, max: number, unit: Unit, perSide: boolean, steps?: readonly number[]) =>
  ({ min, max, unit, perSide, verified: true as const, ...(steps ? { steps } : {}) });
const draft = (min: number, max: number, unit: Unit, perSide: boolean) => ({ min, max, unit, perSide });

/** PRD §6, row by row; options in the table's default order. */
const TABLE: Record<ConcernId, { mdCodes: readonly string[]; options: readonly Row[] }> = {
  'forehead-lines': {
    mdCodes: ['F'],
    options: [
      { modality: 'toxin', nameFa: 'توکسین فرونتالیس', nameEn: 'Frontalis toxin', fx: 'S', base: label(20, 20, 'U', false) },
      { modality: 'skinbooster', nameFa: 'اسکین‌بوستر', nameEn: 'Skin booster', fx: 'S' },
      { modality: 'laser', nameFa: 'لیزر', nameEn: 'Laser', fx: 'S' },
    ],
  },
  'glabellar-lines': {
    mdCodes: ['G'],
    options: [
      { modality: 'toxin', nameFa: 'توکسین', nameEn: 'Toxin', fx: 'S', base: label(20, 20, 'U', false) },
      { modality: 'filler', nameFa: 'فیلر ظریف (فقط پزشک باتجربه)', nameEn: 'Fine filler (experienced injectors only)', fx: 'S' },
    ],
  },
  'crows-feet': {
    mdCodes: ['O'],
    options: [
      { modality: 'toxin', nameFa: 'توکسین', nameEn: 'Toxin', fx: 'S', base: label(24, 24, 'U', false) },
      { modality: 'rf-microneedling', nameFa: 'RF میکرونیدلینگ', nameEn: 'RF microneedling', fx: 'S' },
      { modality: 'skinbooster', nameFa: 'اسکین‌بوستر', nameEn: 'Skin booster', fx: 'S' },
    ],
  },
  'tear-trough': {
    mdCodes: ['Tt', 'Ck3'],
    options: [
      { modality: 'filler', nameFa: 'حمایت گونه', nameEn: 'Cheek support', fx: 'S', mdCodes: ['Ck1', 'Ck2', 'Ck3'], support: true },
      { modality: 'filler', nameFa: 'فیلر HA نرم', nameEn: 'Soft HA filler', fx: 'S', base: draft(0.2, 0.5, 'mL', true), mdCodes: ['Tt'] },
      { modality: 'polynucleotide', nameFa: 'پلی‌نوکلئوتید', nameEn: 'Polynucleotide', fx: 'S' },
    ],
  },
  'midface-volume': {
    mdCodes: ['Ck1', 'Ck2', 'Ck3'],
    options: [
      { modality: 'filler', nameFa: 'فیلر HA ساختاری', nameEn: 'Structural HA filler', fx: 'SW', base: draft(0.5, 1.5, 'mL', true) },
      { modality: 'biostimulator', nameFa: 'بیواستیمولاتور', nameEn: 'Biostimulator', fx: 'SW' },
      { modality: 'thread', nameFa: 'نخ', nameEn: 'Threads', fx: 'W' },
    ],
  },
  'nasolabial-fold': {
    mdCodes: ['Ck', 'NL'],
    options: [
      { modality: 'filler', nameFa: 'حمایت گونه', nameEn: 'Cheek support', fx: 'SW', mdCodes: ['Ck1', 'Ck2', 'Ck3'], support: true },
      { modality: 'filler', nameFa: 'فیلر مستقیم', nameEn: 'Direct filler', fx: 'SW', base: draft(0.3, 1.0, 'mL', true), mdCodes: ['NL'] },
      { modality: 'thread', nameFa: 'نخ', nameEn: 'Threads', fx: 'SW' },
    ],
  },
  marionette: {
    mdCodes: ['M', 'C'],
    options: [
      { modality: 'filler', nameFa: 'فیلر', nameEn: 'Filler', fx: 'SW', base: draft(0.3, 0.8, 'mL', true) },
      { modality: 'toxin', nameFa: 'توکسین DAO', nameEn: 'DAO toxin', fx: 'SW', base: draft(2, 5, 'U', true), mdCodes: [] },
      { modality: 'thread', nameFa: 'نخ', nameEn: 'Threads', fx: 'SW' },
    ],
  },
  'lip-volume': {
    mdCodes: ['Lp'],
    options: [
      { modality: 'filler', nameFa: 'فیلر HA', nameEn: 'HA filler', fx: 'W', base: draft(0.5, 1.0, 'mL', false) },
      { modality: 'toxin', nameFa: 'لیپ‌فلیپ با توکسین', nameEn: 'Lip flip with toxin', fx: 'W', base: draft(2, 6, 'U', false), mdCodes: [] },
    ],
  },
  'perioral-lines': {
    mdCodes: ['Lp'],
    options: [
      { modality: 'filler', nameFa: 'فیلر ظریف', nameEn: 'Fine filler', fx: 'S', base: draft(0.2, 0.5, 'mL', false) },
      { modality: 'toxin', nameFa: 'میکروتوکسین', nameEn: 'Micro-toxin', fx: 'S', mdCodes: [] },
      { modality: 'laser', nameFa: 'لیزر', nameEn: 'Laser', fx: 'S' },
    ],
  },
  chin: {
    mdCodes: ['C'],
    options: [
      { modality: 'filler', nameFa: 'فیلر HA', nameEn: 'HA filler', fx: 'SW', base: draft(1.0, 2.0, 'mL', false) },
      { modality: 'toxin', nameFa: 'توکسین منتالیس', nameEn: 'Mentalis toxin', fx: 'S', base: draft(4, 10, 'U', false), mdCodes: [] },
    ],
  },
  jawline: {
    mdCodes: ['Jw'],
    options: [
      { modality: 'filler', nameFa: 'فیلر', nameEn: 'Filler', fx: 'W', base: draft(1.0, 2.0, 'mL', true) },
      { modality: 'thread', nameFa: 'نخ', nameEn: 'Threads', fx: 'W' },
      { modality: 'hifu', nameFa: 'HIFU یا RF', nameEn: 'HIFU or RF', fx: 'W' },
      { modality: 'biostimulator', nameFa: 'بیواستیمولاتور', nameEn: 'Biostimulator', fx: 'W' },
    ],
  },
  masseter: {
    mdCodes: [],
    options: [{ modality: 'toxin', nameFa: 'توکسین ماستر', nameEn: 'Masseter toxin', fx: 'W', base: draft(20, 30, 'U', true) }],
  },
  temple: {
    mdCodes: ['T'],
    options: [
      { modality: 'filler', nameFa: 'فیلر HA', nameEn: 'HA filler', fx: 'SW', base: draft(0.5, 1.0, 'mL', true) },
      { modality: 'biostimulator', nameFa: 'بیواستیمولاتور', nameEn: 'Biostimulator', fx: 'SW' },
    ],
  },
  brow: {
    mdCodes: ['E'],
    options: [
      { modality: 'toxin', nameFa: 'لیفت شیمیایی با توکسین', nameEn: 'Chemical brow lift with toxin', fx: 'W', base: draft(2, 4, 'U', true), mdCodes: [] },
      { modality: 'filler', nameFa: 'فیلر', nameEn: 'Filler', fx: 'W' },
      { modality: 'thread', nameFa: 'نخ', nameEn: 'Threads', fx: 'W' },
    ],
  },
  neck: {
    mdCodes: [],
    options: [
      { modality: 'toxin', nameFa: 'توکسین پلاتیسما', nameEn: 'Platysma toxin', fx: 'S', base: label(26, 36, 'U', false, [26, 31, 36]) },
      { modality: 'skinbooster', nameFa: 'اسکین‌بوستر', nameEn: 'Skin booster', fx: 'S' },
      { modality: 'hifu', nameFa: 'HIFU', nameEn: 'HIFU', fx: 'S' },
    ],
  },
  'skin-quality': {
    mdCodes: [],
    options: [
      { modality: 'skinbooster', nameFa: 'اسکین‌بوستر', nameEn: 'Skin booster', fx: 'S', base: draft(2, 3, 'session', false) },
      { modality: 'rf-microneedling', nameFa: 'RF میکرونیدلینگ', nameEn: 'RF microneedling', fx: 'S' },
      { modality: 'laser', nameFa: 'لیزر', nameEn: 'Laser', fx: 'S' },
      { modality: 'peel', nameFa: 'پیلینگ', nameEn: 'Peel', fx: 'S' },
    ],
  },
};

/** Every option of PRD §6, grouped by concern in the table's default order. */
export const TREATMENT_OPTIONS: readonly TreatmentOption[] = (Object.entries(TABLE) as [ConcernId, (typeof TABLE)[ConcernId]][]).flatMap(
  ([concernId, row]) =>
    row.options.map((o, i): TreatmentOption => {
      const timing = TIMING[o.modality];
      const base: BaseEstimate | null = o.base
        ? {
            min: o.base.min,
            max: o.base.max,
            unit: o.base.unit,
            perSide: o.base.perSide,
            ...(o.base.steps ? { steps: o.base.steps } : {}),
            status: 'verified' in o.base ? 'verified' : 'draft', // TODO(clinical): draft volumes and off-label doses
            source: 'verified' in o.base ? SRC_LABEL : SRC_TABLE,
          }
        : null;
      const risks: OptionRisk[] = [];
      // The cheek-support option is injected in the cheek, which is not one of the F5.7 areas.
      if (VASCULAR.has(concernId) && INJECTED_VOLUME.has(o.modality) && !o.support) risks.push('vascular');
      if (ENERGY.has(o.modality)) risks.push('fitzpatrick');
      return {
        id: `${concernId}.${i + 1}.${o.modality}`,
        concernId,
        modality: o.modality,
        nameFa: o.nameFa,
        nameEn: o.nameEn,
        mdCodes: CODED.has(o.modality) ? (o.mdCodes ?? row.mdCodes) : [],
        base,
        ...timing,
        efficacy: Math.max(1, 5 - i),
        costTier: COST_TIER[o.modality],
        fx: { type: o.fx, maxStrength: FX_CAP[o.modality] },
        risks,
        contraindications: [],
        ...(o.support ? { support: true as const } : {}),
        // Timing, result rank, cost tier and image cap are drafts for every option (PRD §7.2, owner 2026-11-16).
        status: 'draft',
        source: [SRC_TABLE, base?.status === 'verified' ? SRC_LABEL : null, timing.onsetDays ? SRC_TIMING : null]
          .filter(Boolean)
          .join('; '),
      };
    }),
);

export const optionById = (id: string): TreatmentOption | undefined => TREATMENT_OPTIONS.find((o) => o.id === id);
export const optionsOf = (concernId: ConcernId): TreatmentOption[] => TREATMENT_OPTIONS.filter((o) => o.concernId === concernId);
