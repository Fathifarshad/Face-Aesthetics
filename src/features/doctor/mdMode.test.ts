import { describe, expect, it } from 'vitest';
import { FILLED_BY_SITES, MD_SITE_INFO, MD_SITES, MOVED_TO_SITES } from '../../data/mdCodes';
import { CONCERN_IDS, type ConcernId } from '../../data/types';
import type { SimSetting } from '../../db/types';
import { SMOOTHING } from '../../engine/pipeline';
import { concernsShown, engineInput, siteSettings } from './simDefaults';

/** MD Codes filler mode (docs/TASKS.md M5b): defaults, what each mode shows, and what the engine receives. */
const on = (value: number, left = value): SimSetting => ({ on: true, value, left, mirror: value === left, last: 'R' });

describe('MD Codes sites', () => {
  it('cover the families of PRD §6 with Ck1–Ck3 apart; lips and chin are midline', () => {
    expect([...MD_SITES].sort()).toEqual(['C', 'Ck1', 'Ck2', 'Ck3', 'E', 'Jw', 'Lp', 'M', 'NL', 'T', 'Tt']);
    expect(MD_SITES.filter((s) => MD_SITE_INFO[s].concernId === 'midface-volume')).toEqual(['Ck1', 'Ck2', 'Ck3']);
    expect(MD_SITES.filter((s) => !MD_SITE_INFO[s].bilateral)).toEqual(['Lp', 'C']);
  });

  it('hide in mode B exactly the concerns whose whole effect moved to a site', () => {
    // Moved: no smoothing of their own (volume only), or the under-eye shadow lift that Tt takes over.
    for (const id of FILLED_BY_SITES) expect(MOVED_TO_SITES.has(id), id).toBe(!SMOOTHING[id] || id === 'tear-trough');
    const shown = concernsShown('mdcodes', CONCERN_IDS);
    expect(shown).toContain('masseter');
    expect(shown).toContain('nasolabial-fold');
    expect(shown).not.toContain('midface-volume');
    expect(shown).not.toContain('tear-trough');
    expect(concernsShown('area', CONCERN_IDS)).toEqual([...CONCERN_IDS]);
  });
});

describe('siteSettings', () => {
  const concerns: Partial<Record<ConcernId, SimSetting>> = {
    'midface-volume': on(0.6),
    chin: on(0.4, 0.2),
    jawline: on(0.5, 0.3),
  };

  it('starts each site from its concern in mode A (cheek 60 % → Ck1–Ck3 60 %)', () => {
    const s = siteSettings(['Ck1', 'Ck2', 'Ck3', 'Jw', 'C', 'T'], concerns, {});
    for (const site of ['Ck1', 'Ck2', 'Ck3'] as const) expect(s[site]).toEqual(on(0.6));
    expect(s.Jw).toEqual(on(0.5, 0.3));
    // A midline site has one slider.
    expect(s.C).toMatchObject({ on: true, value: 0.4, left: 0.4, mirror: true });
    // A concern with nothing set starts off.
    expect(s.T).toMatchObject({ on: false, value: 0 });
  });

  it('keeps the sliders the doctor moved and only the sites on the photo', () => {
    const s = siteSettings(['Ck1', 'Ck2'], concerns, { Ck2: on(0.2) });
    expect(s.Ck1!.value).toBe(0.6);
    expect(s.Ck2!.value).toBe(0.2);
    expect(Object.keys(s)).toEqual(['Ck1', 'Ck2']);
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
  const sites = siteSettings(['Tt', 'Ck1', 'Ck2', 'NL', 'Lp'], concerns, { Ck2: on(0.2, 0.1) });

  it('mode A: every concern with its full effect, no sites', () => {
    const { changes, sites: s } = engineInput('area', concerns, sites);
    expect(s).toEqual([]);
    expect(changes.map((c) => c.concernId).sort()).toEqual(Object.keys(concerns).sort());
    expect(changes.every((c) => c.effect === undefined)).toBe(true);
  });

  it('mode B: concerns that give volume to sites smooth only; sites carry the volume; Tt lifts the under-eye shadow', () => {
    const { changes, sites: s } = engineInput('mdcodes', concerns, sites, (k) => (k === 'Lp' ? 2 : 1));
    const by = (id: ConcernId) => changes.filter((c) => c.concernId === id);
    expect(by('forehead-lines')[0]).toEqual({ concernId: 'forehead-lines', intensity: 0.5 });
    expect(by('nasolabial-fold')[0]).toMatchObject({ intensity: 0.3, effect: 'smooth' });
    expect(by('masseter')[0]).toEqual({ concernId: 'masseter', intensity: 0.7, left: 0.5 });
    expect(by('midface-volume')).toEqual([]);
    expect(by('lip-volume')).toEqual([]);
    // The under-eye slider is hidden; Tt drives the same smoothing, once.
    expect(by('tear-trough')).toEqual([{ concernId: 'tear-trough', intensity: 0.4, effect: 'smooth' }]);
    expect(s).toEqual([
      { site: 'Ck1', intensity: 0.6 },
      { site: 'Ck2', intensity: 0.2, left: 0.1 },
      { site: 'NL', intensity: 0.3 },
      { site: 'Lp', intensity: 1 },
    ]);
  });

  it('leaves out switched-off and zero sliders', () => {
    const off = { ...sites, Ck1: { ...sites.Ck1!, on: false }, NL: on(0) };
    const { sites: s } = engineInput('mdcodes', concerns, off);
    expect(s.map((x) => x.site)).toEqual(['Ck2', 'Lp']);
  });
});
