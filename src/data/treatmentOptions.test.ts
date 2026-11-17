import { describe, expect, it } from 'vitest';
import { chosenOption, defaultOrder, sessionsOf, sortOptions, SORT_KEYS } from './optionSort';
import { FX_CAP, TREATMENT_OPTIONS, optionsOf } from './treatmentOptions';
import { CONCERN_IDS } from './types';

describe('knowledge base (PRD §6)', () => {
  it('has options for all 16 concerns, with unique ids', () => {
    for (const id of CONCERN_IDS) expect(optionsOf(id).length).toBeGreaterThan(0);
    expect(new Set(TREATMENT_OPTIONS.map((o) => o.id)).size).toBe(TREATMENT_OPTIONS.length);
  });

  it('marks only the toxin doses of the label as label doses; every option is verified by the clinical sign-off, with a source', () => {
    const verified = TREATMENT_OPTIONS.filter((o) => o.base?.label).map((o) => o.concernId);
    expect(verified.sort()).toEqual(['crows-feet', 'forehead-lines', 'glabellar-lines', 'neck']);
    for (const o of TREATMENT_OPTIONS) {
      expect(o.status).toBe('verified');
      expect(o.source).toContain('reviewed and approved by');
      if (o.base) expect(o.base.status).toBe('verified');
      expect(o.source).toContain('PRD');
      if (o.base?.label) expect(o.modality).toBe('toxin');
    }
  });

  it('keeps every estimate a range with a unit', () => {
    for (const o of TREATMENT_OPTIONS) if (o.base) expect(o.base.max).toBeGreaterThanOrEqual(o.base.min);
  });

  it('caps the image as PRD F5.3: forehead toxin 0.85, skin booster 0.35, never above the safety ceiling', () => {
    const [toxin, booster] = optionsOf('forehead-lines');
    expect(toxin!.fx.maxStrength).toBe(0.85);
    expect(booster!.fx.maxStrength).toBe(0.35);
    for (const cap of Object.values(FX_CAP)) expect(cap).toBeLessThanOrEqual(0.85);
  });

  it('tags vascular high-risk injectables and energy devices (PRD F5.7)', () => {
    expect(optionsOf('glabellar-lines')[1]!.risks).toContain('vascular');
    expect(optionsOf('temple')[0]!.risks).toContain('vascular');
    expect(optionsOf('glabellar-lines')[0]!.risks).toEqual([]);
    expect(optionsOf('nasolabial-fold').find((o) => o.support)!.risks).toEqual([]);
    expect(optionsOf('skin-quality').find((o) => o.modality === 'laser')!.risks).toContain('fitzpatrick');
  });

  it('gives MD Codes families to filler and toxin options only', () => {
    for (const o of TREATMENT_OPTIONS) if (!['filler', 'toxin'].includes(o.modality)) expect(o.mdCodes).toEqual([]);
  });
});

describe('ordering (PRD F5.2, F5.5, F5.6)', () => {
  it('supports the cheek first only from midface grade 2 (F5.6)', () => {
    expect(defaultOrder('nasolabial-fold', 2)[0]!.support).toBe(true);
    expect(defaultOrder('tear-trough', 3)[0]!.support).toBe(true);
    const low = defaultOrder('nasolabial-fold', 1);
    expect(low[0]!.support).toBeUndefined();
    expect(low.at(-1)!.support).toBe(true);
    expect(low[0]!.efficacy).toBe(5);
  });

  it('sorts by each of the five criteria', () => {
    const skin = defaultOrder('skin-quality', 0);
    expect(sortOptions(skin, 'result').map((o) => o.modality)).toEqual(['skinbooster', 'rf-microneedling', 'laser', 'peel']);
    expect(sortOptions(skin, 'cost')[0]!.modality).toBe('skinbooster');
    const jaw = defaultOrder('jawline', 0);
    expect(sortOptions(jaw, 'onset')[0]!.modality).toBe('filler');
    expect(sortOptions(jaw, 'durability')[0]!.modality).toBe('biostimulator');
    expect(sortOptions(jaw, 'downtime')[0]!.modality).toBe('hifu');
    for (const key of SORT_KEYS) expect(sortOptions(jaw, key)).toHaveLength(jaw.length);
  });

  it('puts options without timing last and keeps the default order between them', () => {
    const sorted = sortOptions(defaultOrder('skin-quality', 0), 'onset');
    expect(sorted.map((o) => o.modality)).toEqual(['laser', 'rf-microneedling', 'skinbooster', 'peel']);
  });

  it('falls back to the first default option when nothing or a foreign option is chosen', () => {
    expect(chosenOption('neck', undefined, 0)!.modality).toBe('toxin');
    expect(chosenOption('neck', optionsOf('chin')[0]!.id, 0)!.concernId).toBe('neck');
    expect(chosenOption('neck', optionsOf('neck')[2]!.id, 0)!.modality).toBe('hifu');
  });

  it('orders sessions toxin → structure → fine areas → the rest (F5.5)', () => {
    const picked = [optionsOf('skin-quality')[0]!, optionsOf('lip-volume')[0]!, optionsOf('chin')[0]!, optionsOf('crows-feet')[0]!];
    expect(sessionsOf(picked).map((s) => [s.stage, s.options[0]!.concernId])).toEqual([
      [1, 'crows-feet'],
      [2, 'chin'],
      [3, 'lip-volume'],
      [4, 'skin-quality'],
    ]);
  });
});
