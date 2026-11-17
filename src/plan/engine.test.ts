import { describe, expect, it } from 'vitest';
import { TREATMENTS } from './data/treatments';
import { buildSessions, hardBlocks, softFlags, tierFromGap } from './engine';
import { emptyIntake, type Intake } from './intake';

describe('tier from target gap (TREATMENTS §4)', () => {
  it.each([
    [40, 40, 'minimal'],
    [40, 37, 'minimal'],
    [40, 36, 'recommended'],
    [40, 32, 'recommended'],
    [40, 31, 'comprehensive'],
  ] as const)('actual %i target %i → %s', (a, t, tier) => expect(tierFromGap(a, t)).toBe(tier));
});

/** Every option for a finding with its hard blocks and soft flags (the screening the plan page uses). */
const screen = (findingKey: string, intake: Intake) =>
  TREATMENTS.filter((o) => o.findingKeys.includes(findingKey)).map((o) => ({
    option: o,
    blocks: hardBlocks(o, intake),
    flags: softFlags(o, intake),
  }));
const open = (rows: ReturnType<typeof screen>) => rows.filter((r) => r.blocks.length === 0);

describe('contraindications (TREATMENTS §5)', () => {
  it('hard block: pregnancy hides every injectable', () => {
    const rows = screen('midface.volume', { ...emptyIntake(), pregnant_or_breastfeeding: true });
    expect(open(rows).every((r) => r.option.modality === 'device')).toBe(true);
    expect(rows.filter((r) => r.blocks.length).map((r) => r.option.id)).toContain('midface.ha-high-gprime');
  });
  it('hard block: active infection only in that area', () => {
    const intake = { ...emptyIntake(), active_infection_site: ['lips' as const] };
    expect(open(screen('lips.volume', intake))).toHaveLength(0);
    expect(open(screen('chin.retrusion', intake)).length).toBeGreaterThan(0);
  });
  it('soft flag: anticoagulants keep the option with a warning', () => {
    const rows = screen('chin.retrusion', { ...emptyIntake(), anticoagulants: true });
    expect(rows.every((r) => r.blocks.length === 0)).toBe(true);
    expect(rows.some((r) => r.flags.includes('anticoagulants'))).toBe(true);
  });
  it('soft flag: herpes history only on perioral areas', () => {
    const intake = { ...emptyIntake(), herpes_history: true };
    expect(screen('lips.volume', intake).some((r) => r.flags.includes('herpes_history'))).toBe(true);
    expect(screen('midface.volume', intake).some((r) => r.flags.includes('herpes_history'))).toBe(false);
  });
  it('soft flag: high Fitzpatrick on fitzpatrick-caution options', () => {
    const rows = screen('skin.pigmentation', { ...emptyIntake(), fitzpatrick: 5 });
    expect(rows.some((r) => r.flags.includes('fitzpatrick'))).toBe(true);
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

describe('knowledge base integrity', () => {
  it('has unique ids, and no invented volumes', () => {
    const ids = TREATMENTS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(TREATMENTS.every((t) => t.volumeOrUnits === undefined)).toBe(true);
  });
});
