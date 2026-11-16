import { defaultIntensity } from '../../data/ageNorms';
import type { AgeTarget, ConcernId, Finding } from '../../data/types';
import { chosenOption } from '../../data/optionSort';
import type { FxType, TreatmentOption } from '../../data/treatmentOptions';
import { familyBilateral, FILLED_BY_SITES, MD_CODE_INFO, MD_FAMILY_INFO, MOVED_TO_SITES, type MdCode, type MdFamily, type MdKey } from '../../data/mdCodes';
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

const OFF: SimSetting = { on: false, value: 0, left: 0, mirror: true, last: 'R' };

/**
 * MD Codes family sliders (mode B, docs/TASKS.md M5b–M5c): the doctor's own where they moved one, otherwise the
 * current mode-A value of the family's concern (cheek volume 60 % → Ck 60 %). A family without a concern starts
 * off. A family whose codes are all midline has one slider.
 */
export function familySettings(
  families: readonly MdFamily[],
  concerns: Partial<Record<ConcernId, SimSetting>>,
  overrides: Partial<Record<MdKey, SimSetting>>,
): Partial<Record<MdFamily, SimSetting>> {
  return Object.fromEntries(
    families.map((family) => {
      const own = overrides[family];
      if (own) return [family, own];
      const from = MD_FAMILY_INFO[family].from;
      const base = (from && concerns[from]) || OFF;
      return [family, familyBilateral(family) ? { ...base } : { ...base, left: base.value, mirror: true }];
    }),
  );
}

/**
 * Code sliders: each follows its family's values until the doctor moves it. A code is on when its family is on
 * and the code itself is on (`codeOn`, else `starts`). A midline code takes the family's main value.
 */
export function codeSettings(
  codes: readonly MdCode[],
  families: Partial<Record<MdFamily, SimSetting>>,
  overrides: Partial<Record<MdKey, SimSetting>>,
  codeOn: Partial<Record<MdCode, boolean>>,
): Partial<Record<MdCode, SimSetting>> {
  return Object.fromEntries(
    codes.map((code) => {
      const info = MD_CODE_INFO[code];
      const family = families[info.family] ?? OFF;
      const values = overrides[code] ?? family;
      const on = family.on && (codeOn[code] ?? info.starts);
      return [code, info.bilateral ? { ...values, on } : { ...values, on, left: values.value, mirror: true }];
    }),
  );
}

/**
 * Concern sliders shown in a mode: in mode B the ones whose whole effect moved to an MD Codes site are hidden,
 * except the concerns in `byArea` (their family is off, see `familiesOff`): they keep their own slider and effect.
 */
export const concernsShown = (mode: SimMode, available: readonly ConcernId[], byArea: ReadonlySet<ConcernId> = new Set()) =>
  mode === 'mdcodes' ? available.filter((id) => !MOVED_TO_SITES.has(id) || byArea.has(id)) : [...available];

/**
 * PRD F6.1 (M7): the MD Codes layer is only for filler options. A family is off in mode B when the doctor chose
 * an option for its concern that is not a filler (lip flip, mentalis toxin, threads…); that concern is then
 * simulated by its own slider, as in mode A. Families whose concern has no explicit choice keep the reviewed
 * M5b–M5c behaviour.
 */
export function familiesOff(
  choices: Partial<Record<ConcernId, string>>,
  options: Partial<Record<ConcernId, TreatmentOption>>,
): { families: ReadonlySet<MdFamily>; concerns: ReadonlySet<ConcernId> } {
  const families = new Set<MdFamily>();
  const concerns = new Set<ConcernId>();
  for (const [family, info] of Object.entries(MD_FAMILY_INFO) as [MdFamily, (typeof MD_FAMILY_INFO)[MdFamily]][]) {
    const id = info.from;
    if (!id || !choices[id]) continue;
    const o = options[id];
    if (o && o.modality !== 'filler') {
      families.add(family);
      concerns.add(id);
    }
  }
  return { families, concerns };
}

const active = (s: SimSetting) => s.on && (s.value > 0 || (!s.mirror && s.left > 0));
const strengths = (s: SimSetting, k: number) => (s.mirror ? { intensity: s.value * k } : { intensity: s.value * k, left: s.left * k });

/**
 * What the engine renders. Mode A: every concern with the effect of its chosen option (`fx`; full when absent).
 * Mode B: the concerns that give their volume to codes smooth only, the masseter (toxin, no family) keeps its
 * effect, and every code that is on drives its own operators or smooths its own part of a region (Tt1–Tt3 take
 * the under-eye shadow lift, owner 2026-11-16). `scale` scales one slider (the lip type).
 */
export function engineInput(
  mode: SimMode,
  concerns: Partial<Record<ConcernId, SimSetting>>,
  codes: Partial<Record<MdCode, SimSetting>>,
  scale: (key: ConcernId | MdCode) => number = () => 1,
  fx: Partial<Record<ConcernId, FxType>> = {},
  byArea: ReadonlySet<ConcernId> = new Set(),
): { changes: Change[]; sites: SiteChange[] } {
  const changes: Change[] = [];
  for (const id of concernsShown(mode, Object.keys(concerns) as ConcernId[], byArea)) {
    const s = concerns[id]!;
    if (!active(s)) continue;
    // The chosen option's effect type (PRD F5.3); in mode B a concern filled by sites never warps by itself,
    // unless its family is off (`byArea`, non-filler option).
    const type = fx[id] ?? 'SW';
    const smooth = type !== 'W';
    const warp = type !== 'S' && !(mode === 'mdcodes' && FILLED_BY_SITES.has(id) && !byArea.has(id));
    if (!smooth && !warp) continue;
    const effect = smooth && warp ? {} : { effect: smooth ? ('smooth' as const) : ('warp' as const) };
    changes.push({ concernId: id, ...strengths(s, scale(id)), ...effect });
  }
  const out: SiteChange[] = [];
  if (mode === 'mdcodes')
    for (const [site, s] of Object.entries(codes) as [MdCode, SimSetting][]) {
      if (active(s)) out.push({ site, ...strengths(s, scale(site)) });
    }
  return { changes, sites: out };
}
