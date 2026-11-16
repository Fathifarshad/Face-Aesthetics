import { defaultIntensity } from '../../data/ageNorms';
import type { AgeTarget, ConcernId, Finding } from '../../data/types';
import { chosenOption } from '../../data/optionSort';
import type { FxType, TreatmentOption } from '../../data/treatmentOptions';
import { FILLED_BY_SITES, MD_SITE_INFO, MOVED_TO_SITES, type MdSite } from '../../data/mdCodes';
import type { SimMode, SimSetting } from '../../db/types';
import type { Change, SiteChange } from '../../engine/pipeline';

/** A finding feeds the simulation only after the doctor confirmed or edited it (PRD F2.4). */
export const usable = (f: Finding) => f.reviewed === 'confirmed' || f.reviewed === 'edited';

/**
 * Age-appropriate default of one change (PRD F3.1): each side's slider starts at `intensity` of its own grade;
 * the change is on when either side has something to remove. Rejected or unreviewed findings give 0.
 * Sides with the same value keep the mirror on.
 */
export function defaultSetting(concernId: ConcernId, findings: readonly Finding[], realAge: number, target: AgeTarget): SimSetting {
  const of = (side: Finding['side']) => {
    const f = findings.find((x) => x.concernId === concernId && x.side === side);
    return f && usable(f) ? defaultIntensity(concernId, f.grade, realAge, target) : 0;
  };
  const both = findings.some((x) => x.concernId === concernId && x.side === 'both');
  const right = both ? of('both') : of('R');
  const left = both ? right : of('L');
  const round = (v: number) => Math.round(v * 100) / 100;
  return { on: right > 0 || left > 0, value: round(right), left: round(left), mirror: round(right) === round(left), last: 'R' };
}

/** Settings of every available change: the doctor's own where they moved it, the default everywhere else. */
export function effectiveSettings(
  available: readonly ConcernId[],
  findings: readonly Finding[],
  realAge: number,
  target: AgeTarget,
  overrides: Partial<Record<ConcernId, SimSetting>>,
): Partial<Record<ConcernId, SimSetting>> {
  return Object.fromEntries(available.map((id) => [id, overrides[id] ?? defaultSetting(id, findings, realAge, target)]));
}

/** Highest confirmed midface volume grade of either side: drives «اول حمایت، بعد چین» (PRD F5.6). */
export const midfaceGradeOf = (findings: readonly Finding[]) =>
  Math.max(0, ...findings.filter((f) => f.concernId === 'midface-volume' && usable(f)).map((f) => f.grade));

/** The treatment option in force for each concern: the doctor's choice, or the first allowed default (PRD F5.1, F5.6). */
export function chosenOptions(
  concernIds: readonly ConcernId[],
  choices: Partial<Record<ConcernId, string>>,
  findings: readonly Finding[],
  allowed?: (o: TreatmentOption) => boolean,
): Partial<Record<ConcernId, TreatmentOption>> {
  const midface = midfaceGradeOf(findings);
  const out: Partial<Record<ConcernId, TreatmentOption>> = {};
  for (const id of concernIds) {
    const o = chosenOption(id, choices[id], midface, allowed);
    if (o) out[id] = o;
  }
  return out;
}

/** PRD F5.3: a chosen option caps its concern's slider at the option's `fx.maxStrength`. */
export function capSettings(
  settings: Partial<Record<ConcernId, SimSetting>>,
  options: Partial<Record<ConcernId, TreatmentOption>>,
): Partial<Record<ConcernId, SimSetting>> {
  const round = (v: number) => Math.round(v * 100) / 100;
  return Object.fromEntries(
    (Object.entries(settings) as [ConcernId, SimSetting][]).map(([id, s]) => {
      const cap = options[id]?.fx.maxStrength;
      return [id, cap === undefined ? s : { ...s, value: round(Math.min(s.value, cap)), left: round(Math.min(s.left, cap)) }];
    }),
  );
}

/**
 * MD Codes sliders (mode B, docs/TASKS.md M5b): the doctor's own where they moved one, otherwise the current
 * mode-A value of the site's concern (for example cheek volume 60 % → Ck1, Ck2 and Ck3 at 60 %). A midline site
 * (lips, chin) has one slider. Only sites that can be placed on this photo are returned.
 */
export function siteSettings(
  sites: readonly MdSite[],
  concerns: Partial<Record<ConcernId, SimSetting>>,
  overrides: Partial<Record<MdSite, SimSetting>>,
): Partial<Record<MdSite, SimSetting>> {
  const off: SimSetting = { on: false, value: 0, left: 0, mirror: true, last: 'R' };
  return Object.fromEntries(
    sites.map((site) => {
      const own = overrides[site];
      if (own) return [site, own];
      const from = concerns[MD_SITE_INFO[site].concernId] ?? off;
      return [site, MD_SITE_INFO[site].bilateral ? { ...from } : { ...from, left: from.value, mirror: true }];
    }),
  );
}

/** Concern sliders shown in a mode: in mode B the ones whose whole effect moved to an MD Codes site are hidden. */
export const concernsShown = (mode: SimMode, available: readonly ConcernId[]) =>
  mode === 'mdcodes' ? available.filter((id) => !MOVED_TO_SITES.has(id)) : [...available];

const active = (s: SimSetting) => s.on && (s.value > 0 || (!s.mirror && s.left > 0));
const strengths = (s: SimSetting, k: number) => (s.mirror ? { intensity: s.value * k } : { intensity: s.value * k, left: s.left * k });

/**
 * What the engine renders. Mode A: every concern with the effect of its chosen option (`fx`; full when absent). Mode B: the concerns that give their
 * volume to sites smooth only, the masseter (toxin, no family) keeps its effect, Tt drives the under-eye shadow
 * lift (owner 2026-11-16), and every other site drives its warp operators. `scale` scales one slider (the lip type).
 */
export function engineInput(
  mode: SimMode,
  concerns: Partial<Record<ConcernId, SimSetting>>,
  sites: Partial<Record<MdSite, SimSetting>>,
  scale: (key: ConcernId | MdSite) => number = () => 1,
  fx: Partial<Record<ConcernId, FxType>> = {},
): { changes: Change[]; sites: SiteChange[] } {
  const changes: Change[] = [];
  for (const id of concernsShown(mode, Object.keys(concerns) as ConcernId[])) {
    const s = concerns[id]!;
    if (!active(s)) continue;
    // The chosen option's effect type (PRD F5.3); in mode B a concern filled by sites never warps by itself.
    const type = fx[id] ?? 'SW';
    const smooth = type !== 'W';
    const warp = type !== 'S' && !(mode === 'mdcodes' && FILLED_BY_SITES.has(id));
    if (!smooth && !warp) continue;
    const effect = smooth && warp ? {} : { effect: smooth ? ('smooth' as const) : ('warp' as const) };
    changes.push({ concernId: id, ...strengths(s, scale(id)), ...effect });
  }
  const out: SiteChange[] = [];
  if (mode === 'mdcodes')
    for (const [site, s] of Object.entries(sites) as [MdSite, SimSetting][]) {
      if (!active(s)) continue;
      if (site === 'Tt') changes.push({ concernId: 'tear-trough', ...strengths(s, scale(site)), effect: 'smooth' });
      else out.push({ site, ...strengths(s, scale(site)) });
    }
  return { changes, sites: out };
}
