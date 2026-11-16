import type { ConcernId } from './types';

/**
 * MD Codes of the simulation page's filler mode (docs/TASKS.md M5b, M5c; PRD F6). Only the code, its anatomical
 * name and an approximate zone are used; the source table's depth, tool and volume are not shown (PRD F6.2) and
 * nothing here is a clinical value. MD Codes™ is a trademark (PRD F6.4–F6.5); the licence review is still open.
 *
 * Source of the 51 codes and their English names: de Maio M., Aesthetic Plast Surg 2020;45(2):690–709,
 * PMC8012343, Table 3, licence CC BY 4.0 (attribution required, shown on the page). The Persian names are
 * Claude's translation for a senior physician to check, so every code is `draft`. // TODO(clinical)
 */
export const MD_FAMILIES = ['F', 'T', 'G', 'E', 'O', 'Tt', 'N', 'Ck', 'NL', 'Lp', 'M', 'C', 'Jw'] as const;
export type MdFamily = (typeof MD_FAMILIES)[number];

export const MD_CODES = [
  'F1', 'F2', 'F3',
  'T1', 'T2',
  'G1', 'G2',
  'E1', 'E2', 'E3',
  'O1', 'O2', 'O3',
  'Tt1', 'Tt2', 'Tt3',
  'N1', 'N2', 'N3', 'N4', 'N5',
  'Ck1', 'Ck2', 'Ck3', 'Ck4', 'Ck5',
  'NL1', 'NL2', 'NL3',
  'Lp1', 'Lp2', 'Lp3', 'Lp4', 'Lp5', 'Lp6', 'Lp7', 'Lp8',
  'M1', 'M2', 'M3',
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6',
  'Jw1', 'Jw2', 'Jw3', 'Jw4', 'Jw5',
] as const;
export type MdCode = (typeof MD_CODES)[number];
/** A slider of mode B: a family (opens into its codes) or one code. */
export type MdKey = MdFamily | MdCode;

export const MD_CODES_SOURCE = 'de Maio M., Aesthetic Plast Surg 2020;45(2):690–709, PMC8012343, Table 3 (CC BY 4.0)';

export interface MdFamilyInfo {
  nameFa: string;
  nameEn: string;
  /**
   * Concern whose mode-A slider the family starts from when the doctor switches to mode B (cheek volume 60 % →
   * Ck 60 %). null: no PRD §6 concern gives it a default (nose), or its codes start off (F, G, O: their lines are
   * smoothed by the concern sliders, which stay in mode B), so the family starts off.
   */
  from: ConcernId | null;
}

export interface MdCodeInfo {
  family: MdFamily;
  nameFa: string;
  /** Anatomical name from Table 3. */
  nameEn: string;
  /** Right and left sliders with the mirror switch; false for a midline code. */
  bilateral: boolean;
  /**
   * On when mode B starts. The codes that carry the M5b sites start on, so the starting picture of mode B stays
   * the one the owner reviewed; every other code starts off until the doctor switches it on. Interface choice.
   */
  starts: boolean;
  status: 'draft';
}

export const MD_FAMILY_INFO: Record<MdFamily, MdFamilyInfo> = {
  F: { nameFa: 'پیشانی', nameEn: 'Forehead', from: null },
  T: { nameFa: 'شقیقه', nameEn: 'Temple', from: 'temple' },
  G: { nameFa: 'گلابلا', nameEn: 'Glabella', from: null },
  E: { nameFa: 'ابرو', nameEn: 'Eyebrow', from: 'brow' },
  O: { nameFa: 'دور چشم', nameEn: 'Lateral orbital area', from: null },
  Tt: { nameFa: 'ناودان اشکی', nameEn: 'Tear trough', from: 'tear-trough' },
  N: { nameFa: 'بینی', nameEn: 'Nose', from: null },
  Ck: { nameFa: 'گونه', nameEn: 'Cheek', from: 'midface-volume' },
  NL: { nameFa: 'چین نازولبیال', nameEn: 'Nasolabial fold', from: 'nasolabial-fold' },
  Lp: { nameFa: 'لب', nameEn: 'Lips', from: 'lip-volume' },
  M: { nameFa: 'ماریونت', nameEn: 'Marionette line', from: 'marionette' },
  C: { nameFa: 'چانه', nameEn: 'Chin', from: 'chin' },
  Jw: { nameFa: 'خط فک', nameEn: 'Jawline', from: 'jawline' },
};

const code = (family: MdFamily, nameFa: string, nameEn: string, bilateral: boolean, starts: boolean): MdCodeInfo => ({
  family,
  nameFa,
  nameEn,
  bilateral,
  starts,
  status: 'draft',
});

export const MD_CODE_INFO: Record<MdCode, MdCodeInfo> = {
  F1: code('F', 'پیشانی، داخلی', 'Medial forehead', true, false),
  F2: code('F', 'پیشانی، خارجی', 'Lateral forehead', true, false),
  F3: code('F', 'پیشانی، مرکزی', 'Central forehead', false, false),
  T1: code('T', 'شقیقهٔ قدامی', 'Anterior temple', true, true),
  T2: code('T', 'شقیقهٔ خلفی', 'Posterior temple', true, true),
  G1: code('G', 'گلابلا، خارجی', 'Lateral glabella', true, false),
  G2: code('G', 'گلابلا، مرکزی', 'Central glabella', false, false),
  E1: code('E', 'دم ابرو', 'Eyebrow tail', true, true),
  E2: code('E', 'میانهٔ ابرو', 'Eyebrow centre', true, false),
  // Owner decision 2026-11-16: E3 works and the doctor switches it off when not wanted. The only operator that
  // moves a brow head; every other one leaves it alone.
  E3: code('E', 'سر ابرو', 'Eyebrow head', true, true),
  O1: code('O', 'دور چشم خارجی، میانی', 'Lateral orbital area, central', true, false),
  O2: code('O', 'دور چشم خارجی، پایینی', 'Lateral orbital area, lower', true, false),
  O3: code('O', 'دور چشم خارجی، بالایی', 'Lateral orbital area, upper', true, false),
  Tt1: code('Tt', 'زیر چشم، میانی', 'Central infraorbital area', true, true),
  Tt2: code('Tt', 'زیر چشم، خارجی', 'Lateral infraorbital area', true, true),
  Tt3: code('Tt', 'زیر چشم، داخلی', 'Medial infraorbital area', true, true),
  // Nose: no concern in PRD §6 and a high-risk vascular area; kept with a switch (owner 2026-11-16), all start off.
  N1: code('N', 'خار قدامی بینی', 'Anterior nasal spine', false, false),
  N2: code('N', 'کلوملا', 'Columella', false, false),
  N3: code('N', 'زاویهٔ پیشانی و بینی', 'Frontonasal angle', false, false),
  N4: code('N', 'تیغهٔ استخوانی بینی', 'Bony dorsum', false, false),
  N5: code('N', 'تیغهٔ غضروفی بینی', 'Cartilaginous dorsum', false, false),
  Ck1: code('Ck', 'قوس زایگوما', 'Zygomatic arch', true, true),
  Ck2: code('Ck', 'برجستگی زایگوما', 'Zygomatic eminence', true, true),
  Ck3: code('Ck', 'گونهٔ قدامی‌میانی', 'Anteromedial cheek', true, true),
  Ck4: code('Ck', 'گونهٔ تحتانی خارجی (ناحیهٔ پاروتید)', 'Lateral lower cheek / parotid area', true, false),
  Ck5: code('Ck', 'زیر گونه (ناحیهٔ باکال)', 'Submalar / buccal area', true, false),
  NL1: code('NL', 'چین نازولبیال، بالایی', 'Upper nasolabial fold', true, true),
  NL2: code('NL', 'چین نازولبیال، میانی', 'Central nasolabial fold', true, true),
  NL3: code('NL', 'چین نازولبیال، پایینی', 'Lower nasolabial fold', true, true),
  Lp1: code('Lp', 'بدنهٔ قرمز لب', 'Vermilion body', false, true),
  Lp2: code('Lp', 'کمان کیوپید', "Cupid's bow", false, false),
  Lp3: code('Lp', 'لبهٔ لب', 'Lip border', false, false),
  Lp4: code('Lp', 'توبرکل میانی', 'Medial tubercle', false, false),
  Lp5: code('Lp', 'توبرکل‌های کناری', 'Lateral tubercles', true, false),
  Lp6: code('Lp', 'گوشهٔ لب', 'Oral commissure', true, false),
  Lp7: code('Lp', 'ستون فیلتروم', 'Philtrum column', true, false),
  Lp8: code('Lp', 'خطوط دور لب', 'Perioral lines', false, false),
  M1: code('M', 'خط ماریونت، بالایی', 'Upper marionette line', true, true),
  M2: code('M', 'خط ماریونت، میانی', 'Central marionette line', true, true),
  M3: code('M', 'خط ماریونت، پایینی', 'Lower marionette line', true, true),
  C1: code('C', 'زاویهٔ لب و چانه', 'Labiomental angle', false, false),
  C2: code('C', 'رأس چانه', 'Chin apex', false, true),
  C3: code('C', 'چانهٔ قدامی', 'Anterior chin', true, true),
  C4: code('C', 'پوگونیون بافت نرم', 'Anterior chin / soft tissue pogonion', false, false),
  C5: code('C', 'چانهٔ تحتانی خارجی', 'Lateral lower chin', true, false),
  C6: code('C', 'چانهٔ خارجی', 'Lateral chin', true, false),
  Jw1: code('Jw', 'زاویهٔ فک', 'Mandible angle', true, true),
  Jw2: code('Jw', 'جلوی گوش', 'Pre-auricular area', true, false),
  Jw3: code('Jw', 'تنهٔ فک', 'Mandible body', true, false),
  Jw4: code('Jw', 'پیش‌جول تحتانی', 'Lower prejowl', true, true),
  Jw5: code('Jw', 'چانهٔ قدامی تحتانی', 'Lower anterior chin', true, false),
};

export const isMdFamily = (k: string): k is MdFamily => (MD_FAMILIES as readonly string[]).includes(k);
export const isMdCode = (k: string): k is MdCode => k in MD_CODE_INFO;
export const codesOf = (family: MdFamily): MdCode[] => MD_CODES.filter((c) => MD_CODE_INFO[c].family === family);
/** A family has the mirror switch when any of its codes has two sides. */
export const familyBilateral = (family: MdFamily) => codesOf(family).some((c) => MD_CODE_INFO[c].bilateral);

/**
 * Concerns whose warp moves to the codes in mode B (no area gets volume twice): their own slider only smooths
 * there. Their smoothing stays on the concern slider, except where a whole concern moved (below).
 */
export const FILLED_BY_SITES: ReadonlySet<ConcernId> = new Set(
  MD_FAMILIES.map((f) => MD_FAMILY_INFO[f].from).filter((id): id is ConcernId => id !== null),
);
/**
 * Concerns whose whole effect moves to codes in mode B: their own slider is not shown there. The under-eye
 * shadow lift moves to Tt1–Tt3 (owner decision 2026-11-16).
 */
export const MOVED_TO_SITES: ReadonlySet<ConcernId> = new Set<ConcernId>(['tear-trough', 'midface-volume', 'lip-volume', 'jawline', 'brow']);
