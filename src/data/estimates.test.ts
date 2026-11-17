import { describe, expect, it } from 'vitest';
import {
  codeRange,
  costOf,
  DEFAULT_TARIFF,
  estimateOption,
  fillerTypeOf,
  planTotals,
  roundTo,
  totalOf,
  type EstimateResult,
  type Tariff,
} from './estimates';
import { codesNamed, WARNING_CODES } from './mdCodes';
import { sortOptions } from './optionSort';
import { optionById, optionsOf, TREATMENT_OPTIONS, type TreatmentOption } from './treatmentOptions';

const opt = (id: string) => {
  const o = optionById(id);
  if (!o) throw new Error(id);
  return o;
};
const ok = (r: EstimateResult) => {
  if (!r.ok) throw new Error(r.missing);
  return r.est;
};
type G = 0 | 1 | 2 | 3 | 4;
const both = (grade: G, intensity: number) => ({ both: { grade, intensity } });
const sides = (grade: G, intensity: number) => ({ R: { grade, intensity }, L: { grade, intensity } });

describe('estimateOption (PRD §5.7)', () => {
  it('scales the base by grade factor and intensity, rounded to 0.1 mL', () => {
    // Midface structural filler 0.5–1.5 mL per side; grade 3 × 0.6 → 0.3–0.9.
    const e = ok(estimateOption(opt('midface-volume.1.filler'), sides(3, 0.6), undefined));
    expect(e).toMatchObject({ min: 0.3, max: 0.9, unit: 'mL', perSide: true, status: 'verified', label: false });
    expect(e.left).toBeUndefined();
    // Grade 4 → factor 1.25 × 0.5: 0.3125 → 0.3, 0.9375 → 0.9.
    expect(ok(estimateOption(opt('midface-volume.1.filler'), sides(4, 0.5), undefined))).toMatchObject({ min: 0.3, max: 0.9 });
  });

  it('keeps sides apart when they differ, and counts both in the total', () => {
    const e = ok(estimateOption(opt('temple.1.filler'), { R: { grade: 3, intensity: 1 }, L: { grade: 1, intensity: 1 } }, undefined));
    expect(e).toMatchObject({ min: 0.5, max: 1 });
    expect(e.left).toEqual({ min: 0.3, max: 0.5 });
    expect(totalOf(e)).toEqual({ min: 0.8, max: 1.5 });
  });

  it('rounds toxin to 2 U and gives no toxin number unless the brand is OnabotulinumtoxinA', () => {
    const masseter = opt('masseter.1.toxin'); // 20–30 U per side, off-label draft
    expect(estimateOption(masseter, sides(3, 0.6), undefined)).toEqual({ ok: false, missing: 'brand' });
    expect(estimateOption(masseter, sides(3, 0.6), 'other')).toEqual({ ok: false, missing: 'brand' });
    expect(ok(estimateOption(masseter, sides(3, 0.6), 'onabotulinumtoxinA'))).toMatchObject({ min: 12, max: 18, unit: 'U' });
    // Grade 2 × 0.6: 9 → 10, 13.5 → 14 (2 U steps).
    expect(ok(estimateOption(masseter, sides(2, 0.6), 'onabotulinumtoxinA'))).toMatchObject({ min: 10, max: 14 });
  });

  it('shows label doses as on the label, never scaled', () => {
    const glabella = ok(estimateOption(opt('glabellar-lines.1.toxin'), both(1, 0.3), 'onabotulinumtoxinA'));
    expect(glabella).toMatchObject({ min: 20, max: 20, label: true, status: 'verified' });
    const neck = ok(estimateOption(opt('neck.1.toxin'), both(2, 0.5), 'onabotulinumtoxinA'));
    expect(neck.steps).toEqual([26, 31, 36]);
  });

  it('gives no number without a base, or with the change off', () => {
    expect(estimateOption(opt('midface-volume.2.biostimulator'), sides(3, 1), undefined)).toEqual({ ok: false, missing: 'no-base' });
    expect(estimateOption(opt('chin.1.filler'), both(3, 0), undefined)).toEqual({ ok: false, missing: 'off' });
  });

  it('takes the stronger side for a total estimate', () => {
    // Chin filler 1.0–2.0 mL total; the stronger side (grade 3 × 0.8) decides: 0.8–1.6.
    const e = ok(estimateOption(opt('chin.1.filler'), { R: { grade: 3, intensity: 0.8 }, L: { grade: 2, intensity: 0.8 } }, undefined));
    expect(e).toMatchObject({ min: 0.8, max: 1.6, perSide: false });
  });

  it('uses the doctor override first (F7.5)', () => {
    const e = ok(
      estimateOption(opt('midface-volume.2.biostimulator'), sides(3, 1), undefined, { min: 1, max: 2, unit: 'mL', perSide: false, note: 'x' }),
    );
    expect(e).toMatchObject({ min: 1, max: 2, overridden: true, note: 'x' });
  });

  it('only toxin doses are label doses; rounding is exact', () => {
    for (const o of TREATMENT_OPTIONS) if (o.base?.label) expect(o.modality).toBe('toxin');
    expect(roundTo(0.15000000002, 0.1)).toBe(0.2);
    expect(roundTo(9, 2)).toBe(10);
  });
});

const TARIFF: Tariff = { ...DEFAULT_TARIFF, currency: 'X', filler: { structural: 100, soft: 120, lip: 110 }, toxinUnit: 5 };

describe('cost and totals (F7.3, F7.4)', () => {
  it('prices fillers by type', () => {
    expect(fillerTypeOf(opt('lip-volume.1.filler'))).toBe('lip');
    expect(fillerTypeOf(opt('tear-trough.2.filler'))).toBe('soft');
    expect(fillerTypeOf(opt('tear-trough.1.filler'))).toBe('structural'); // cheek support
    const e = ok(estimateOption(opt('midface-volume.1.filler'), sides(3, 0.6), undefined));
    expect(costOf(opt('midface-volume.1.filler'), e, TARIFF)).toEqual({ min: 60, max: 180 });
    expect(costOf(opt('midface-volume.1.filler'), e, DEFAULT_TARIFF)).toBeNull();
  });

  it('sums mL, syringes (rounded up), units and vials', () => {
    const item = (id: string, s: Parameters<typeof estimateOption>[1]) => ({
      option: opt(id),
      result: estimateOption(opt(id), s, 'onabotulinumtoxinA'),
    });
    const items = [
      item('midface-volume.1.filler', sides(3, 0.6)), // 0.3–0.9 per side → 0.6–1.8
      item('chin.1.filler', both(3, 0.8)), // 0.8–1.6
      item('glabellar-lines.1.toxin', both(2, 1)), // 20 U label
      item('jawline.2.thread', sides(3, 1)), // no base
    ];
    const t = planTotals(items, TARIFF);
    expect(t.fillerMl).toEqual({ min: 1.4, max: 3.4 });
    expect(t.syringes).toEqual({ min: 2, max: 4 });
    expect(t.toxinU).toEqual({ min: 20, max: 20 });
    expect(t.vials).toEqual({ min: 1, max: 1 });
    expect(t.noEstimate).toBe(1);
    expect(t.costMissing).toBe(1);
    expect(t.cost).toEqual({ min: 140 + 100, max: 340 + 100 });
    expect(planTotals(items, { ...TARIFF, syringeMl: 1.7 }).syringes).toEqual({ min: 1, max: 2 });
  });

  it('sorts by the tariff cost only when every option has one', () => {
    const list = optionsOf('marionette'); // filler, DAO toxin, thread
    const partial = (o: TreatmentOption) => (o.modality === 'thread' ? null : o.modality === 'toxin' ? 50 : 10);
    expect(sortOptions(list, 'cost', partial).map((o) => o.modality)).toEqual(['toxin', 'filler', 'thread']); // tier order
    const all = (o: TreatmentOption) => (o.modality === 'thread' ? 1 : o.modality === 'toxin' ? 50 : 10);
    expect(sortOptions(list, 'cost', all).map((o) => o.modality)).toEqual(['thread', 'filler', 'toxin']);
  });
});

describe('MD Codes ranges and warnings (F6.2)', () => {
  it('per-code range is 0 to the bolus cap × slider', () => {
    expect(codeRange('Ck2', 1)).toEqual({ min: 0, max: 0.3 });
    expect(codeRange('Ck2', 0.5)).toEqual({ min: 0, max: 0.2 });
    expect(codeRange('T1', 1)).toEqual({ min: 0, max: 0.5 });
    expect(codeRange('Jw1', 0.6)).toEqual({ min: 0, max: 0.3 });
  });

  it('warning codes are the F5.7 vascular areas', () => {
    expect([...WARNING_CODES].sort()).toEqual(['G1', 'G2', 'N1', 'N2', 'N3', 'N4', 'N5', 'NL1', 'T1', 'T2', 'Tt1', 'Tt2', 'Tt3'].sort());
    expect(codesNamed(['Ck', 'NL1'])).toEqual(['Ck1', 'Ck2', 'Ck3', 'Ck4', 'Ck5', 'NL1']);
  });
});
