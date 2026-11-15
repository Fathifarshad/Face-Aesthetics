import { describe, expect, it } from 'vitest';
import { defaultSetting, effectiveSettings } from './simDefaults';
import { AGE_NORMS, allowed, defaultIntensity, intensity, SAFETY_CEILING, targetAgeOf } from '../../data/ageNorms';
import { GRADE_THRESHOLDS, gradeFromIndex } from '../../data/gradeThresholds';
import { AUTO_GRADED, BILATERAL, SCALES, sidesOf } from '../../data/concerns';
import { CONCERN_IDS, type Finding } from '../../data/types';

describe('allowed (PRD §5.3)', () => {
  it('follows the PRD table: 25 → 0, 50 → 2, 62 → 3', () => {
    expect(allowed(25)).toBe(0);
    expect(allowed(50)).toBe(2);
    expect(allowed(62.5)).toBe(3);
  });

  it('is 0 below 25 and never above 3', () => {
    expect(allowed(18)).toBe(0);
    expect(allowed(90)).toBe(3);
  });

  it('rises linearly between', () => {
    expect(allowed(37.5)).toBeCloseTo(1, 10);
    expect(allowed(43.75)).toBeCloseTo(1.5, 10);
  });

  it('every concern has coefficients, marked draft with a source', () => {
    for (const id of CONCERN_IDS) {
      expect(AGE_NORMS[id].status).toBe('draft');
      expect(AGE_NORMS[id].source).toMatch(/PRD/);
    }
  });
});

describe('intensity (PRD §5.3)', () => {
  it('is (grade − target) / grade above the target', () => {
    expect(intensity(4, 2)).toBe(0.5);
    expect(intensity(3, 1.5)).toBe(0.5);
    expect(intensity(4, 0)).toBe(1);
  });

  it('is 0 at or below the target, and for grade 0', () => {
    expect(intensity(2, 2)).toBe(0);
    expect(intensity(1, 2.5)).toBe(0);
    expect(intensity(0, 0)).toBe(0);
  });
});

describe('target age', () => {
  it('subtracts the offset', () => {
    expect(targetAgeOf(50, { kind: 'offset', offset: 0 })).toBe(50);
    expect(targetAgeOf(50, { kind: 'offset', offset: 10 })).toBe(40);
  });

  it('keeps a typed age between 18 and the real age', () => {
    expect(targetAgeOf(50, { kind: 'custom', age: 43 })).toBe(43);
    expect(targetAgeOf(50, { kind: 'custom', age: 60 })).toBe(50);
    expect(targetAgeOf(50, { kind: 'custom', age: 5 })).toBe(18);
    expect(targetAgeOf(50, { kind: 'custom', age: 42.6 })).toBe(43);
  });

  it('a younger target gives a stronger default, capped at 85 %', () => {
    // Real age 50, grade 4: target 0 → allowed 2 → 0.5; 10 years younger → allowed 1.2 → 0.7.
    expect(defaultIntensity('nasolabial-fold', 4, 50, { kind: 'offset', offset: 0 })).toBeCloseTo(0.5, 10);
    expect(defaultIntensity('nasolabial-fold', 4, 50, { kind: 'offset', offset: 10 })).toBeCloseTo(0.7, 10);
    // Real age 30, grade 4, 10 years younger → allowed 0 → 1, capped.
    expect(defaultIntensity('nasolabial-fold', 4, 30, { kind: 'offset', offset: 10 })).toBe(SAFETY_CEILING);
  });
});

const finding = (concernId: Finding['concernId'], side: Finding['side'], grade: Finding['grade'], reviewed: Finding['reviewed'] = 'confirmed'): Finding => ({
  concernId,
  side,
  grade,
  reviewed,
  autoGrade: null,
  confidence: null,
});

describe('default slider settings', () => {
  const offset0 = { kind: 'offset', offset: 0 } as const;

  it('uses each side’s own grade; mirror only when the sides agree', () => {
    const s = defaultSetting('nasolabial-fold', [finding('nasolabial-fold', 'R', 4), finding('nasolabial-fold', 'L', 3)], 50, offset0);
    expect(s).toMatchObject({ on: true, value: 0.5, mirror: false });
    expect(s.left).toBeCloseTo(0.33, 2);
    const same = defaultSetting('nasolabial-fold', [finding('nasolabial-fold', 'R', 4), finding('nasolabial-fold', 'L', 4)], 50, offset0);
    expect(same.mirror).toBe(true);
  });

  it('ignores pending and rejected findings (PRD F2.4)', () => {
    expect(defaultSetting('neck', [finding('neck', 'both', 4, 'pending')], 50, offset0).on).toBe(false);
    expect(defaultSetting('neck', [finding('neck', 'both', 4, 'rejected')], 50, offset0).on).toBe(false);
    expect(defaultSetting('neck', [finding('neck', 'both', 4, 'edited')], 50, offset0).on).toBe(true);
  });

  it('is off when the grade is already age-appropriate', () => {
    expect(defaultSetting('neck', [finding('neck', 'both', 2)], 50, offset0)).toMatchObject({ on: false, value: 0 });
  });

  it('changing the target moves the defaults but never a change the doctor moved', () => {
    const findings = [finding('neck', 'both', 3), finding('marionette', 'R', 3), finding('marionette', 'L', 3)];
    const manual = { on: true, value: 0.2, left: 0.2, mirror: true, last: 'R' as const };
    const a = effectiveSettings(['neck', 'marionette'], findings, 50, offset0, { marionette: manual });
    const b = effectiveSettings(['neck', 'marionette'], findings, 50, { kind: 'offset', offset: 10 }, { marionette: manual });
    expect(b.neck!.value).toBeGreaterThan(a.neck!.value);
    expect(b.marionette).toEqual(manual);
    expect(a.marionette).toEqual(manual);
  });
});

describe('concern facts and grade thresholds', () => {
  it('every auto-graded concern has ascending draft thresholds; manual ones have none', () => {
    for (const id of CONCERN_IDS) {
      const t = GRADE_THRESHOLDS[id];
      if (!AUTO_GRADED.has(id)) {
        expect(t, id).toBeUndefined();
        continue;
      }
      expect(t!.status).toBe('draft');
      expect([...t!.bounds]).toEqual([...t!.bounds].sort((x, y) => x - y));
    }
  });

  it('maps an index to the number of boundaries it reaches', () => {
    const b = [1, 2, 3, 4] as const;
    expect(gradeFromIndex(0.5, b)).toBe(0);
    expect(gradeFromIndex(1, b)).toBe(1);
    expect(gradeFromIndex(3.9, b)).toBe(3);
    expect(gradeFromIndex(10, b)).toBe(4);
  });

  it('bilateral concerns have two sides, the rest one; scales are draft', () => {
    for (const id of CONCERN_IDS) expect(sidesOf(id)).toEqual(BILATERAL.has(id) ? ['R', 'L'] : ['both']);
    expect(SCALES.status).toBe('draft');
  });
});
