import type { ConcernId } from './types';

/**
 * Injection-site families of the MD Codes filler mode on the simulation page (docs/TASKS.md M5b, PRD F6).
 * Only the family name and the concern it belongs to (PRD §6 table, column «خانوادهٔ MD Codes»). The table of
 * codes, zones, depths, tools and volumes is entered by a senior physician from PMC8012343 (PRD F6.3); until then
 * nothing more is shown. MD Codes™ is a trademark (PRD F6.4–F6.5).
 *
 * Ck1, Ck2, Ck3: zygomatic arch, zygomatic eminence, anteromedial cheek (PRD §7, PMID 32445044). They are three
 * separate sliders (owner decision 2026-11-16).
 */
export const MD_SITES = ['T', 'E', 'Tt', 'Ck1', 'Ck2', 'Ck3', 'NL', 'Lp', 'M', 'C', 'Jw'] as const;
export type MdSite = (typeof MD_SITES)[number];

export interface MdSiteInfo {
  /** Concern whose mode-A slider this site starts from when the doctor switches to the MD Codes mode. */
  concernId: ConcernId;
  /** Right and left sliders with the mirror switch; false for the midline sites (lips, chin). */
  bilateral: boolean;
}

export const MD_SITE_INFO: Record<MdSite, MdSiteInfo> = {
  T: { concernId: 'temple', bilateral: true },
  E: { concernId: 'brow', bilateral: true },
  Tt: { concernId: 'tear-trough', bilateral: true },
  Ck1: { concernId: 'midface-volume', bilateral: true },
  Ck2: { concernId: 'midface-volume', bilateral: true },
  Ck3: { concernId: 'midface-volume', bilateral: true },
  NL: { concernId: 'nasolabial-fold', bilateral: true },
  Lp: { concernId: 'lip-volume', bilateral: false },
  M: { concernId: 'marionette', bilateral: true },
  C: { concernId: 'chin', bilateral: false },
  Jw: { concernId: 'jawline', bilateral: true },
};

export const MD_SITES_SOURCE = 'docs/PRD.md §6 (family column), §7 (Ck1–Ck3), PMID 32445044';

/**
 * Mode B of the simulation page. A concern listed here gives its volume to MD Codes sites, so its own slider does
 * no warp in mode B (no area gets volume twice). Its smoothing stays, except under the eye: there the shadow lift
 * moves to the Tt slider (owner decision 2026-11-16), so the concern's own slider is hidden.
 */
export const FILLED_BY_SITES: ReadonlySet<ConcernId> = new Set(Object.values(MD_SITE_INFO).map((i) => i.concernId));
/** Concerns whose whole effect moves to a site in mode B: their own slider is not shown there. */
export const MOVED_TO_SITES: ReadonlySet<ConcernId> = new Set<ConcernId>(['tear-trough', 'midface-volume', 'lip-volume', 'jawline', 'brow']);
