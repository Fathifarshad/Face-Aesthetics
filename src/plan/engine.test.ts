import { describe, expect, it } from 'vitest';
import { TREATMENTS } from './data/treatments';
import mdcodes from './data/mdcodes.json';
import {
  ageFactor,
  buildSessions,
  costEstimate,
  defaultSelection,
  optionsForFinding,
  planFindings,
  tierFromGap,
} from './engine';
import { emptyIntake } from './intake';

describe('tier from target gap (TREATMENTS §4)', () => {
  it.each([
    [40, 40, 'minimal'],
    [40, 37, 'minimal'],
    [40, 36, 'recommended'],
    [40, 32, 'recommended'],
    [40, 31, 'comprehensive'],
  ] as const)('actual %i target %i → %s', (a, t, tier) => expect(tierFromGap(a, t)).toBe(tier));
});

describe('tier filter', () => {
  it('shows only options with minTier ≤ selected tier', () => {
    const min = optionsForFinding('temple.hollowing', 'minimal', emptyIntake());
    expect(min.options).toHaveLength(0);
    const rec = optionsForFinding('temple.hollowing', 'recommended', emptyIntake());
    expect(rec.options.map((o) => o.option.id)).toEqual(['temple.ha-deep']);
    const comp = optionsForFinding('temple.hollowing', 'comprehensive', emptyIntake());
    expect(comp.options.length).toBe(3);
  });
});

describe('contraindications (TREATMENTS §5)', () => {
  it('hard block: pregnancy hides every injectable', () => {
    const intake = { ...emptyIntake(), pregnant_or_breastfeeding: true };
    const r = optionsForFinding('midface.volume', 'comprehensive', intake);
    expect(r.options.every((o) => o.option.modality === 'device')).toBe(true);
    expect(r.blocked.map((b) => b.option.id)).toContain('midface.ha-high-gprime');
  });
  it('hard block: active infection only in that area', () => {
    const intake = { ...emptyIntake(), active_infection_site: ['lips' as const] };
    expect(optionsForFinding('lips.volume', 'comprehensive', intake).options).toHaveLength(0);
    expect(optionsForFinding('chin.retrusion', 'comprehensive', intake).options.length).toBeGreaterThan(0);
  });
  it('soft flag: anticoagulants keep the option with a warning', () => {
    const intake = { ...emptyIntake(), anticoagulants: true };
    const r = optionsForFinding('chin.retrusion', 'minimal', intake);
    expect(r.options[0]!.flags).toContain('anticoagulants');
    expect(r.blocked).toHaveLength(0);
  });
  it('soft flag: herpes history only on perioral areas', () => {
    const intake = { ...emptyIntake(), herpes_history: true };
    expect(optionsForFinding('lips.volume', 'minimal', intake).options[0]!.flags).toContain('herpes_history');
    expect(optionsForFinding('midface.volume', 'minimal', intake).options[0]!.flags).not.toContain('herpes_history');
  });
  it('soft flag: high Fitzpatrick on fitzpatrick-caution options', () => {
    const intake = { ...emptyIntake(), fitzpatrick: 5 };
    const r = optionsForFinding('skin.pigmentation', 'recommended', intake);
    expect(r.options[0]!.flags).toContain('fitzpatrick');
  });
});

describe('priority with age factor', () => {
  it('prioritises findings typical of older bands than the target', () => {
    expect(ageFactor('jowl', 35)).toBeGreaterThan(1);
    expect(ageFactor('lines.forehead', 45)).toBeLessThan(1);
    const plans = planFindings({ jowl: 2, 'lines.forehead': 2 }, 'comprehensive', emptyIntake(), 35);
    expect(plans[0]!.findingKey).toBe('jowl');
  });
  it('skips severity 0', () => {
    expect(planFindings({ jowl: 0 }, 'comprehensive', emptyIntake(), 35)).toHaveLength(0);
  });
});

describe('sequencing (TREATMENTS §3)', () => {
  it('toxin first, structure before detail', () => {
    const { sessions } = buildSessions(['lips.ha-soft', 'upper.toxin', 'midface.ha-high-gprime']);
    expect(sessions.map((s) => s.kind)).toEqual(['toxin-energy', 'structure', 'detail']);
    expect(sessions[0]!.optionIds).toEqual(['upper.toxin']);
    expect(sessions[1]!.after?.en).toBe('1–2 weeks later');
  });
  it('caps high-risk vascular zones per session with a warning', () => {
    const { sessions, warnings } = buildSessions(['lips.ha-soft', 'tt.ha-soft-cannula', 'nl.ha-medium']);
    const detail = sessions.filter((s) => s.kind === 'detail');
    expect(detail).toHaveLength(3);
    expect(detail.every((s) => s.highRiskZones <= 1)).toBe(true);
    expect(warnings.some((w) => w.code === 'high-risk-cap')).toBe(true);
  });
  it('series items are listed separately; missing volume data is warned', () => {
    const { sessions, warnings } = buildSessions(['skin.ha-booster', 'chin.ha-high-gprime']);
    expect(sessions.at(-1)!.kind).toBe('series');
    expect(warnings.some((w) => w.code === 'no-data-volume')).toBe(true);
  });
});

describe('selection and cost', () => {
  it('default selection prefers an unflagged option', () => {
    const plans = planFindings({ 'chin.retrusion': 2 }, 'comprehensive', emptyIntake(), 30);
    expect(defaultSelection(plans)['chin.retrusion']).toEqual(['chin.ha-high-gprime']);
  });
  it('sums prices and reports missing ones', () => {
    expect(costEstimate(['a', 'b', 'a'], { a: 10 })).toEqual({ total: 10, missing: ['b'] });
  });
});

describe('knowledge base integrity', () => {
  it('has unique ids, no invented volumes and empty MD Codes data', () => {
    const ids = TREATMENTS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(TREATMENTS.every((t) => t.volumeOrUnits === undefined)).toBe(true);
    expect(mdcodes).toEqual([]);
  });
});
