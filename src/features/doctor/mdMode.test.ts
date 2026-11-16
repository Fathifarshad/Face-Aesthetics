import { describe, expect, it } from 'vitest';
import { codesOf, FILLED_BY_SITES, MD_CODE_INFO, MD_CODES, MD_FAMILIES, MD_FAMILY_INFO, MOVED_TO_SITES } from '../../data/mdCodes';
import { CONCERN_IDS, type ConcernId } from '../../data/types';
import type { SimSetting } from '../../db/types';
import { SMOOTHING } from '../../engine/pipeline';
import { codeSettings, concernsShown, engineInput, familySettings } from './simDefaults';

/** MD Codes filler mode (docs/TASKS.md M5b, M5c): defaults, what each mode shows, and what the engine receives. */
const on = (value: number, left = value): SimSetting => ({ on: true, value, left, mirror: value === left, last: 'R' });

describe('MD Codes set', () => {
  it('has the 51 codes of Table 3 in 13 families, each draft with an English and a Persian name', () => {
    expect(MD_CODES).toHaveLength(51);
    expect(MD_FAMILIES).toHaveLength(13);
    const count = Object.fromEntries(MD_FAMILIES.map((f) => [f, codesOf(f).length]));
    expect(count).toEqual({ F: 3, T: 2, G: 2, E: 3, O: 3, Tt: 3, N: 5, Ck: 5, NL: 3, Lp: 8, M: 3, C: 6, Jw: 5 });
    for (const c of MD_CODES) {
      expect(c.startsWith(MD_CODE_INFO[c].family), c).toBe(true);
      expect(MD_CODE_INFO[c].status).toBe('draft');
      expect(MD_CODE_INFO[c].nameEn.length, c).toBeGreaterThan(3);
      expect(MD_CODE_INFO[c].nameFa.length, c).toBeGreaterThan(2);
    }
  });

  it('starts mode B with the codes of the M5b sites; nose, F, G, O and the new codes start off', () => {
    const starts = MD_CODES.filter((c) => MD_CODE_INFO[c].starts);
    for (const c of ['Ck1', 'Ck2', 'Ck3', 'T1', 'T2', 'E1', 'Tt1', 'Tt2', 'Tt3', 'NL1', 'Lp1', 'M1', 'C2', 'C3', 'Jw1', 'Jw4'] as const)
      expect(starts, c).toContain(c);
    // E3 works and starts on; the doctor switches it off when not wanted (owner 2026-11-16).
    expect(starts).toContain('E3');
    for (const c of ['N1', 'N2', 'N3', 'N4', 'N5', 'F1', 'G2', 'O1', 'Ck4', 'Ck5', 'Lp8'] as const) expect(starts, c).not.toContain(c);
    for (const f of ['N', 'F', 'G', 'O'] as const) expect(MD_FAMILY_INFO[f].from, f).toBeNull();
  });

  it('hide in mode B exactly the concerns whose whole effect moved to codes', () => {
    // Moved: no smoothing of their own (volume only), or the under-eye shadow lift that Tt1–Tt3 take over.
    for (const id of FILLED_BY_SITES) expect(MOVED_TO_SITES.has(id), id).toBe(!SMOOTHING[id] || id === 'tear-trough');
    const shown = concernsShown('mdcodes', CONCERN_IDS);
    for (const id of ['masseter', 'nasolabial-fold', 'forehead-lines', 'crows-feet', 'perioral-lines'] as const) expect(shown).toContain(id);
    expect(shown).not.toContain('midface-volume');
    expect(shown).not.toContain('tear-trough');
    expect(concernsShown('area', CONCERN_IDS)).toEqual([...CONCERN_IDS]);
  });
});

describe('familySettings and codeSettings', () => {
  const concerns: Partial<Record<ConcernId, SimSetting>> = {
    'midface-volume': on(0.6),
    chin: on(0.4, 0.2),
    jawline: on(0.5, 0.3),
  };

  it('starts each family from its concern in mode A (cheek 60 % → Ck 60 %); a family without one starts off', () => {
    const f = familySettings(['Ck', 'Jw', 'C', 'T', 'N'], concerns, {});
    expect(f.Ck).toEqual(on(0.6));
    expect(f.Jw).toEqual(on(0.5, 0.3));
    expect(f.C).toEqual(on(0.4, 0.2));
    expect(f.T).toMatchObject({ on: false, value: 0 });
    expect(f.N).toMatchObject({ on: false, value: 0 });
  });

  it('codes follow their family until moved; a code is on when its family and the code itself are on', () => {
    const fam = familySettings(['Ck', 'C'], concerns, { Ck: on(0.7) });
    const c = codeSettings(['Ck1', 'Ck2', 'Ck4', 'C2', 'C3'], fam, { Ck2: on(0.2, 0.1) }, { Ck1: false });
    expect(c.Ck1).toMatchObject({ on: false, value: 0.7 });
    expect(c.Ck2).toMatchObject({ on: true, value: 0.2, left: 0.1 });
    // Ck4 starts off until the doctor switches it on.
    expect(c.Ck4).toMatchObject({ on: false, value: 0.7 });
    // A midline code takes the family's main value; a two-sided one keeps both sides.
    expect(c.C2).toMatchObject({ on: true, value: 0.4, left: 0.4, mirror: true });
    expect(c.C3).toMatchObject({ on: true, value: 0.4, left: 0.2 });
    // A family switched off switches all its codes off.
    const off = codeSettings(['Ck2'], { Ck: { ...on(0.7), on: false } }, { Ck2: on(0.2) }, { Ck2: true });
    expect(off.Ck2!.on).toBe(false);
    // M5b keys still read: T, Lp … are families now, Ck1–Ck3 codes.
    expect(familySettings(['T'], concerns, { T: on(0.3) }).T).toEqual(on(0.3));
  });
});

describe('engineInput', () => {
  const concerns: Partial<Record<ConcernId, SimSetting>> = {
    'forehead-lines': on(0.5),
    'tear-trough': on(0.4),
    'midface-volume': on(0.6),
    'nasolabial-fold': on(0.3),
    masseter: on(0.7, 0.5),
    'lip-volume': on(0.5),
  };
  const families = familySettings(['Tt', 'Ck', 'NL', 'Lp'], concerns, {});
  const codes = codeSettings(['Tt1', 'Tt3', 'Ck1', 'Ck2', 'Ck4', 'NL2', 'Lp1', 'Lp6'], families, { Ck2: on(0.2, 0.1) }, {});

  it('mode A: every concern with its full effect, no codes', () => {
    const { changes, sites: s } = engineInput('area', concerns, codes);
    expect(s).toEqual([]);
    expect(changes.map((c) => c.concernId).sort()).toEqual(Object.keys(concerns).sort());
    expect(changes.every((c) => c.effect === undefined)).toBe(true);
  });

  it('mode B: concerns that give volume to codes smooth only; codes that are on carry the volume and the under-eye lift', () => {
    const { changes, sites: s } = engineInput('mdcodes', concerns, codes, (k) => (k === 'Lp1' ? 2 : 1));
    const by = (id: ConcernId) => changes.filter((c) => c.concernId === id);
    expect(by('forehead-lines')[0]).toEqual({ concernId: 'forehead-lines', intensity: 0.5 });
    expect(by('nasolabial-fold')[0]).toMatchObject({ intensity: 0.3, effect: 'smooth' });
    expect(by('masseter')[0]).toEqual({ concernId: 'masseter', intensity: 0.7, left: 0.5 });
    expect(by('midface-volume')).toEqual([]);
    expect(by('lip-volume')).toEqual([]);
    // The under-eye slider is hidden; Tt1 and Tt3 smooth their own parts of it instead.
    expect(by('tear-trough')).toEqual([]);
    expect(s).toEqual([
      { site: 'Tt1', intensity: 0.4 },
      { site: 'Tt3', intensity: 0.4 },
      { site: 'Ck1', intensity: 0.6 },
      { site: 'Ck2', intensity: 0.2, left: 0.1 },
      { site: 'NL2', intensity: 0.3 },
      { site: 'Lp1', intensity: 1 },
    ]);
  });

  it('leaves out switched-off and zero sliders', () => {
    const off = { ...codes, Ck1: { ...codes.Ck1!, on: false }, NL2: on(0) };
    const { sites: s } = engineInput('mdcodes', concerns, off);
    expect(s.map((x) => x.site)).toEqual(['Tt1', 'Tt3', 'Ck2', 'Lp1']);
  });
});
