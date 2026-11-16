import { describe, expect, it } from 'vitest';
import { optionsOf } from '../../data/treatmentOptions';
import type { Finding } from '../../data/types';
import type { SimSetting } from '../../db/types';
import { emptyIntake } from '../../plan/intake';
import { screen } from './optionScreening';
import { capSettings, chosenOptions, concernsShown, engineInput, familiesOff, midfaceGradeOf } from './simDefaults';

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

describe('MD Codes layer only for filler options (PRD F6.1, M7)', () => {
  const lips = optionsOf('lip-volume');
  const chin = optionsOf('chin');

  it('switches a family off only when the doctor chose a non-filler option for its concern', () => {
    // Lip flip (toxin) chosen for the lips; chin follows its default (filler, no explicit choice).
    const off = familiesOff({ 'lip-volume': lips[1]!.id }, { 'lip-volume': lips[1]!, chin: chin[0]! });
    expect([...off.families]).toEqual(['Lp']);
    expect([...off.concerns]).toEqual(['lip-volume']);
    // A default non-filler option without an explicit choice keeps the reviewed M5b-M5c picture.
    expect(familiesOff({}, { chin: chin[1]! }).families.size).toBe(0);
    expect(familiesOff({ chin: chin[0]!.id }, { chin: chin[0]! }).families.size).toBe(0);
  });

  it('a concern whose family is off keeps its own slider and warp in mode B', () => {
    const settings = { 'lip-volume': on(0.6) };
    expect(concernsShown('mdcodes', ['lip-volume'])).toEqual([]);
    expect(concernsShown('mdcodes', ['lip-volume'], new Set(['lip-volume']))).toEqual(['lip-volume']);
    const { changes } = engineInput('mdcodes', settings, {}, () => 1, { 'lip-volume': 'W' }, new Set(['lip-volume']));
    expect(changes).toEqual([{ concernId: 'lip-volume', intensity: 0.6, effect: 'warp' }]);
  });
});
