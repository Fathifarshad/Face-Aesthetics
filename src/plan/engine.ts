import { ageBandOf, bandIndex, CATALOG, type Bi } from '../analysis/catalog';
import { TIERS, TREATMENTS, type Modality, type Stage, type Tier, type TreatmentOption } from './data/treatments';
import type { Intake } from './intake';

// ── Tier & age logic (docs/TREATMENTS.md §4) ───────────────────────────

/** Target gap = actual − target: 0–3 → minimal, 4–8 → recommended, 9+ → comprehensive. */
export function tierFromGap(actualAge: number, targetAge: number): Tier {
  const gap = actualAge - targetAge;
  if (gap <= 3) return 'minimal';
  if (gap <= 8) return 'recommended';
  return 'comprehensive';
}

export const tierRank = (t: Tier): number => TIERS.indexOf(t);

/** TODO(clinical): age-factor magnitudes are placeholders; direction follows TREATMENTS.md §4. */
export const AGE_FACTOR = { olderBand: 1.25, sameOrYounger: 0.85 } as const;

export function ageFactor(findingKey: string, targetAge: number): number {
  const entry = CATALOG[findingKey];
  if (!entry) return 1;
  return bandIndex(entry.onsetBand) > bandIndex(ageBandOf(targetAge)) ? AGE_FACTOR.olderBand : AGE_FACTOR.sameOrYounger;
}

export function priorityScore(findingKey: string, severity: number, targetAge: number): number {
  return severity * (CATALOG[findingKey]?.weight ?? 0.5) * ageFactor(findingKey, targetAge);
}

// ── Contraindications (docs/TREATMENTS.md §5) ──────────────────────────

const INJECTABLE: readonly Modality[] = ['HA', 'biostimulator', 'thread', 'toxin', 'skinbooster', 'injectable-lipolysis'];
const NEEDLING: readonly Modality[] = [...INJECTABLE];
const RESURFACING: readonly Modality[] = ['laser', 'peel'];
const PERIORAL = new Set(['lips', 'perioral', 'chin']);
/** TODO(clinical): Fitzpatrick type from which energy/peel options are flagged. */
export const HIGH_FITZPATRICK_FROM = 4;

export type FlagCode =
  | 'anticoagulants'
  | 'bleeding_disorder'
  | 'autoimmune_disease'
  | 'herpes_history'
  | 'keloid_tendency'
  | 'prior_filler'
  | 'prior_threads'
  | 'permanent_filler'
  | 'recent_procedures_30d'
  | 'isotretinoin_6m'
  | 'neuromuscular_disease'
  | 'allergy_lidocaine'
  | 'fitzpatrick'
  | 'pregnant_or_breastfeeding';

export type BlockCode = 'pregnant_or_breastfeeding' | 'active_infection_site' | 'allergy_ha_or_component';

export function hardBlocks(o: TreatmentOption, intake: Intake): BlockCode[] {
  const out: BlockCode[] = [];
  if (intake.pregnant_or_breastfeeding && INJECTABLE.includes(o.modality)) out.push('pregnant_or_breastfeeding');
  if (intake.active_infection_site.includes(o.area)) out.push('active_infection_site');
  if (intake.allergy_ha_or_component && (o.modality === 'HA' || o.modality === 'skinbooster')) out.push('allergy_ha_or_component');
  return out;
}

export function softFlags(o: TreatmentOption, intake: Intake): FlagCode[] {
  const f: FlagCode[] = [];
  const isRF = o.productClass.includes('RF microneedling');
  if (intake.pregnant_or_breastfeeding && !INJECTABLE.includes(o.modality)) f.push('pregnant_or_breastfeeding');
  if (intake.anticoagulants && (NEEDLING.includes(o.modality) || isRF)) f.push('anticoagulants');
  if (intake.bleeding_disorder && (NEEDLING.includes(o.modality) || isRF)) f.push('bleeding_disorder');
  if (intake.autoimmune_disease && ['HA', 'biostimulator', 'thread', 'skinbooster'].includes(o.modality)) f.push('autoimmune_disease');
  if (intake.herpes_history && PERIORAL.has(o.area)) f.push('herpes_history');
  if (intake.keloid_tendency && (o.modality === 'thread' || isRF || RESURFACING.includes(o.modality))) f.push('keloid_tendency');
  if (intake.prior_filler.includes(o.area) && ['HA', 'biostimulator'].includes(o.modality)) f.push('prior_filler');
  if (intake.prior_threads.includes(o.area) && o.modality === 'thread') f.push('prior_threads');
  if (intake.permanent_filler.includes(o.area)) f.push('permanent_filler');
  if (intake.recent_procedures_30d) f.push('recent_procedures_30d');
  if (intake.isotretinoin_6m && (RESURFACING.includes(o.modality) || o.modality === 'device')) f.push('isotretinoin_6m');
  if (intake.neuromuscular_disease && o.modality === 'toxin') f.push('neuromuscular_disease');
  if (intake.allergy_lidocaine && (o.modality === 'HA' || o.modality === 'skinbooster')) f.push('allergy_lidocaine');
  if (
    intake.fitzpatrick !== null &&
    intake.fitzpatrick >= HIGH_FITZPATRICK_FROM &&
    o.riskTags.includes('fitzpatrick-caution')
  )
    f.push('fitzpatrick');
  return f;
}

// ── Options per finding ────────────────────────────────────────────────

export type OptionView = { option: TreatmentOption; flags: FlagCode[] };
export type FindingPlan = {
  findingKey: string;
  severity: number;
  priority: number;
  options: OptionView[];
  /** Options hidden by a hard contraindication (for the doctor's audit only). */
  blocked: { option: TreatmentOption; reasons: BlockCode[] }[];
};

export function optionsForFinding(findingKey: string, tier: Tier, intake: Intake): Omit<FindingPlan, 'severity' | 'priority'> {
  const options: OptionView[] = [];
  const blocked: FindingPlan['blocked'] = [];
  for (const o of TREATMENTS) {
    if (!o.findingKeys.includes(findingKey) || tierRank(o.minTier) > tierRank(tier)) continue;
    const reasons = hardBlocks(o, intake);
    if (reasons.length) blocked.push({ option: o, reasons });
    else options.push({ option: o, flags: softFlags(o, intake) });
  }
  return { findingKey, options: options.slice(0, 4), blocked };
}

/** Findings with severity ≥ 1, ranked by priority (highest first). */
export function planFindings(
  severities: Record<string, number>,
  tier: Tier,
  intake: Intake,
  targetAge: number,
): FindingPlan[] {
  return Object.entries(severities)
    .filter(([, s]) => s >= 1)
    .map(([key, severity]) => ({
      ...optionsForFinding(key, tier, intake),
      severity,
      priority: priorityScore(key, severity, targetAge),
    }))
    .filter((fp) => fp.options.length > 0 || fp.blocked.length > 0)
    .sort((a, b) => b.priority - a.priority);
}

// ── Sequencing (docs/TREATMENTS.md §3) ─────────────────────────────────

export type SessionKind = 'toxin-energy' | 'structure' | 'detail' | 'series';
export type Session = {
  index: number;
  kind: SessionKind;
  optionIds: string[];
  /** Interval from the previous session. */
  after: Bi | null;
  highRiskZones: number;
};
export type PlanWarning = { code: 'high-risk-cap' | 'energy-before-ha' | 'no-data-volume'; detail?: string };

const STAGE_ORDER: Record<Stage, number> = { toxin: 0, energy: 0, structure: 1, biostim: 1, detail: 2, booster: 3, lipolysis: 3 };

export const INTERVALS = {
  toxinToHa: { fa: '۱ تا ۲ هفته بعد', en: '1–2 weeks later' },
  /** TODO(clinical): interval after thermal devices before HA. */
  energyToHa: { fa: 'طبق دستور سازندهٔ دستگاه (تعیین پزشک)', en: 'per device manufacturer (clinician)' },
  /** TODO(clinical): structure → detail interval not specified in the knowledge base. */
  structureToDetail: { fa: 'به تشخیص پزشک', en: 'per clinician' },
} as const satisfies Record<string, Bi>;

/**
 * Orders the chosen options into sessions:
 * 1) toxin + energy devices, 2) structure (HA/threads/biostim start), 3+) detail HA with at most
 * `maxHighRiskPerSession` high-risk-vascular zones per session; series (boosters, lipolysis) listed separately.
 */
export function buildSessions(optionIds: readonly string[], maxHighRiskPerSession = 1): { sessions: Session[]; warnings: PlanWarning[] } {
  const chosen = optionIds.map((id) => TREATMENTS.find((o) => o.id === id)).filter((o): o is TreatmentOption => !!o);
  const byStage = (s: number) => chosen.filter((o) => STAGE_ORDER[o.stage] === s);
  const sessions: Session[] = [];
  const warnings: PlanWarning[] = [];
  const isHR = (o: TreatmentOption) => o.riskTags.includes('high-risk-vascular');

  const first = byStage(0);
  const hasEnergy = first.some((o) => o.stage === 'energy');
  if (first.length) sessions.push({ index: 0, kind: 'toxin-energy', optionIds: first.map((o) => o.id), after: null, highRiskZones: 0 });

  const pushSplit = (kind: SessionKind, items: TreatmentOption[], firstAfter: Bi | null) => {
    const groups: TreatmentOption[][] = [[]];
    for (const o of items) {
      const cur = groups[groups.length - 1]!;
      if (isHR(o) && cur.filter(isHR).length >= maxHighRiskPerSession) groups.push([o]);
      else cur.push(o);
    }
    if (groups.length > 1) warnings.push({ code: 'high-risk-cap', detail: kind });
    groups
      .filter((g) => g.length)
      .forEach((g, i) =>
        sessions.push({
          index: sessions.length,
          kind,
          optionIds: g.map((o) => o.id),
          after: i === 0 ? firstAfter : INTERVALS.structureToDetail,
          highRiskZones: g.filter(isHR).length,
        }),
      );
  };

  const prevAfter = (): Bi | null =>
    sessions.length === 0 ? null : hasEnergy ? INTERVALS.energyToHa : INTERVALS.toxinToHa;
  const structure = byStage(1);
  if (structure.length) pushSplit('structure', structure, prevAfter());
  const detail = byStage(2);
  if (detail.length) pushSplit('detail', detail, structure.length ? INTERVALS.structureToDetail : prevAfter());
  const series = byStage(3);
  if (series.length)
    sessions.push({ index: sessions.length, kind: 'series', optionIds: series.map((o) => o.id), after: null, highRiskZones: 0 });

  if (hasEnergy && chosen.some((o) => o.modality === 'HA')) warnings.push({ code: 'energy-before-ha' });
  if (chosen.some((o) => (o.modality === 'HA' || o.modality === 'toxin') && !o.volumeOrUnits)) warnings.push({ code: 'no-data-volume' });
  return { sessions, warnings };
}

/** Sum of clinic prices for the chosen options (missing prices count as 0 and are reported). */
export function costEstimate(optionIds: readonly string[], prices: Record<string, number>): { total: number; missing: string[] } {
  let total = 0;
  const missing: string[] = [];
  for (const id of new Set(optionIds)) {
    const p = prices[id];
    if (p === undefined || Number.isNaN(p)) missing.push(id);
    else total += p;
  }
  return { total, missing };
}

/** Default selection: first (non-flagged when possible) option per finding. */
export function defaultSelection(plans: readonly FindingPlan[]): Record<string, string[]> {
  const sel: Record<string, string[]> = {};
  for (const p of plans) {
    const best = p.options.find((o) => o.flags.length === 0) ?? p.options[0];
    sel[p.findingKey] = best ? [best.option.id] : [];
  }
  return sel;
}
