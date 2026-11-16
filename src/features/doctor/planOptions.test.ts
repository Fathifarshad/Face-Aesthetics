import { describe, expect, it } from 'vitest';
import { optionsOf } from '../../data/treatmentOptions';
import type { Finding } from '../../data/types';
import type { SimSetting } from '../../db/types';
import { emptyIntake } from '../../plan/intake';
import { screen } from './optionScreening';
import { capSettings, chosenOptions, engineInput, midfaceGradeOf } from './simDefaults';

/** M6: the chosen treatment option drives the picture (PRD F5.3) and respects the intake checks. */
const on = (value: number): SimSetting => ({ on: true, value, left: value, mirror: true, last: 'R' });
const finding = (concernId: Finding['concernId'], grade: Finding['grade'], side: Finding['side'] = 'both'): Finding => ({
  concernId,
  side,
  autoGrade: null,
  confidence: null,
  grade,
  reviewed: 'confirmed',
});

describe('option → image', () => {
  it('caps a slider at the chosen option (toxin 0.85, skin booster 0.35)', () => {
    const [toxin, booster] = optionsOf('forehead-lines');
    expect(capSettings({ 'forehead-lines': on(0.8) }, { 'forehead-lines': toxin })['forehead-lines']!.value).toBe(0.8);
    const capped = capSettings({ 'forehead-lines': on(0.8) }, { 'forehead-lines': booster })['forehead-lines']!;
    expect([capped.value, capped.left]).toEqual([0.35, 0.35]);
  });

  it('sends the effect type of the option: S smooths only, W warps only, SW both', () => {
    const settings = { 'nasolabial-fold': on(0.6), 'lip-volume': on(0.6), 'crows-feet': on(0.6) };
    const { changes } = engineInput('area', settings, {}, () => 1, { 'nasolabial-fold': 'SW', 'lip-volume': 'W', 'crows-feet': 'S' });
    const effect = (id: string) => changes.find((c) => c.concernId === id)?.effect;
    expect(effect('nasolabial-fold')).toBeUndefined();
    expect(effect('lip-volume')).toBe('warp');
    expect(effect('crows-feet')).toBe('smooth');
  });

  it('never warps a site-filled concern in MD Codes mode, and drops a warp-only option there', () => {
    const settings = { 'nasolabial-fold': on(0.6), marionette: on(0.6) };
    const { changes } = engineInput('mdcodes', settings, {}, () => 1, { 'nasolabial-fold': 'SW', marionette: 'W' });
    expect(changes.map((c) => [c.concernId, c.effect])).toEqual([['nasolabial-fold', 'smooth']]);
  });

  it('switching the option changes what the engine receives', () => {
    const settings = { 'skin-quality': on(0.8) };
    const pick = (i: number) => {
      const o = optionsOf('skin-quality')[i]!;
      return engineInput('area', capSettings(settings, { 'skin-quality': o }), {}, () => 1, { 'skin-quality': o.fx.type }).changes[0]!;
    };
    expect(pick(0).intensity).toBe(0.35);
    expect(pick(1).intensity).toBe(0.5);
  });
});

describe('choice and intake', () => {
  it('reads the midface grade from confirmed findings only', () => {
    const pending: Finding = { ...finding('midface-volume', 3, 'R'), reviewed: 'pending' };
    expect(midfaceGradeOf([pending, finding('midface-volume', 2, 'L')])).toBe(2);
  });

  it('blocks injectables in pregnancy and skips them in the default choice', () => {
    const intake = { ...emptyIntake(), pregnant_or_breastfeeding: true };
    expect(screen(optionsOf('forehead-lines')[0]!, intake).blocks).toContain('pregnant_or_breastfeeding');
    expect(screen(optionsOf('forehead-lines')[2]!, intake).blocks).toEqual([]);
    const chosen = chosenOptions(['forehead-lines'], {}, [], (o) => screen(o, intake).blocks.length === 0);
    expect(chosen['forehead-lines']!.modality).toBe('laser');
  });

  it('flags energy devices for a high Fitzpatrick type', () => {
    const intake = { ...emptyIntake(), fitzpatrick: 5 as const };
    const laser = optionsOf('skin-quality').find((o) => o.modality === 'laser')!;
    expect(screen(laser, intake).flags).toContain('fitzpatrick');
  });
});
