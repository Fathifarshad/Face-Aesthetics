import { costOf, estimateOption, planTotals, type Estimate, type EstimateResult, type PlanTotals, type Sides, type Tariff } from '../../data/estimates';
import { defaultOrder } from '../../data/optionSort';
import type { Range, TreatmentOption } from '../../data/treatmentOptions';
import type { Dict } from '../../i18n/fa';
import { CONCERN_IDS, type ConcernId } from '../../data/types';
import type { Case, GradeRow, PlanRow, SimStateRow } from '../../db/types';
import { screen } from './optionScreening';
import { chosenOptions, effectiveSettings, midfaceGradeOf, usable } from './simDefaults';

export interface PlanInputs {
  c: Pick<Case, 'intake' | 'actualAge'>;
  grades: readonly GradeRow[];
  sim: SimStateRow;
  planRow: PlanRow | null | undefined;
  tariff: Tariff;
}

export interface PlanView {
  /** Confirmed concerns with grade ≥ 1, in PRD order. */
  concerns: ConcernId[];
  chosen: Partial<Record<ConcernId, TreatmentOption>>;
  /** The chosen option of each concern (the one the simulation shows). */
  picked: TreatmentOption[];
  midface: ReturnType<typeof midfaceGradeOf>;
  allowed: (o: TreatmentOption) => boolean;
  estimateOf: (o: TreatmentOption) => EstimateResult;
  /** Middle of the cost range, for sorting by cost. */
  costMid: (o: TreatmentOption) => number | null;
  totals: PlanTotals;
  /** The clinic entered at least one price. */
  hasTariff: boolean;
  /** A toxin option exists among the concerns (the brand question is shown). */
  anyToxin: boolean;
}

/**
 * The plan of a case with its estimates (PRD F5, F7): one function for the plan page and the report (F9.1), so both
 * show the same numbers. Each option is estimated at its concern's slider in the simulation (mode-A sliders, also in
 * mode B), capped by the option's own strength cap.
 */
export function planView({ c, grades, sim, planRow, tariff }: PlanInputs): PlanView {
  const allowed = (o: TreatmentOption) => screen(o, c.intake).blocks.length === 0;
  const concerns = CONCERN_IDS.filter((id) => grades.some((g) => g.concernId === id && usable(g) && g.grade >= 1));
  const chosen = chosenOptions(concerns, sim.options ?? {}, grades, allowed);
  const midface = midfaceGradeOf(grades);
  const picked = concerns.map((id) => chosen[id]).filter((o): o is TreatmentOption => !!o);
  const brand = planRow?.toxinBrand;
  const sliders = effectiveSettings(concerns, grades, c.actualAge, sim.target, sim.overrides);
  const sidesOf = (o: TreatmentOption): Sides => {
    const sl = sliders[o.concernId];
    const at = (v: number) => (sl?.on ? Math.min(v, o.fx.maxStrength) : 0);
    const own = grades.filter((g) => g.concernId === o.concernId && usable(g));
    const grade = (side: 'R' | 'L' | 'both') => own.find((g) => g.side === side)?.grade ?? 0;
    const right = at(sl?.value ?? 0);
    if (own.some((g) => g.side === 'both')) return { both: { grade: grade('both'), intensity: right } };
    const left = at(sl?.mirror ? (sl?.value ?? 0) : (sl?.left ?? 0));
    return { R: { grade: grade('R'), intensity: right }, L: { grade: grade('L'), intensity: left } };
  };
  const estimateOf = (o: TreatmentOption): EstimateResult => estimateOption(o, sidesOf(o), brand, planRow?.estOverrides?.[o.id]);
  const costMid = (o: TreatmentOption) => {
    const r = estimateOf(o);
    const cost = r.ok ? costOf(o, r.est, tariff) : null;
    return cost ? (cost.min + cost.max) / 2 : null;
  };
  const hasTariff =
    Object.values(tariff.filler).some((v) => !!v) || !!tariff.toxinUnit || !!tariff.thread || Object.values(tariff.session).some((v) => !!v);
  const anyToxin = concerns.some((id) => defaultOrder(id, midface).some((o) => o.modality === 'toxin'));
  const totals = planTotals(
    picked.map((o) => ({ option: o, result: estimateOf(o) })),
    tariff,
  );
  return { concerns, chosen, picked, midface, allowed, estimateOf, costMid, totals, hasTariff, anyToxin };
}

type Num = (n: number, digits?: number) => string;

/** Text of estimates, totals and money: shared by the plan page and the report so both read the same. */
export function estimateFormat(t: Dict, num: Num, currency: string) {
  /** Volumes keep their decimal (0.3 mL); units and sessions are whole numbers. */
  const amount = (v: number) => num(v, Number.isInteger(v) ? 0 : 1);
  const span = (a: number, b: number) => (a === b ? amount(a) : t.options.range(amount(a), amount(b)));
  const money = (r: Range) => `${r.min === r.max ? num(r.min) : t.options.range(num(r.min), num(r.max))} ${currency}`;
  const estText = (e: Estimate) => {
    const unit = t.options.units[e.unit];
    const main = e.steps ? e.steps.map(amount).join(` ${t.options.or} `) : span(e.min, e.max);
    if (e.perSide && e.left) return `${t.est.right} ${main} · ${t.est.left} ${span(e.left.min, e.left.max)} ${unit}`;
    return `${main} ${unit} ${e.perSide ? t.options.perSide : t.options.total}`;
  };
  return { amount, span, money, estText };
}
