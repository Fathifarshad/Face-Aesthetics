import type { MdCode } from '../data/mdCodes';
import type { ConcernId } from '../data/types';
import { ANCHOR, L_NASOLABIAL, LIPS_INNER_LOWER, LIPS_INNER_UPPER, LIPS_OUTER_LOWER, LIPS_OUTER_UPPER, R_NASOLABIAL } from './landmarks';
import { toFace } from './faceFrame';
import type { RegionSet, Side } from './regions';
import { centroid, crossingsAtY, lerp } from './shapes';
import type { FaceFrame, Pt } from './types';

/**
 * Local warp for volume and shape (docs/PRD.md §5.4 «جابه‌جایی موضعی», prompts/SUPERPROMPT.md «warp.ts»).
 *
 * Two operators, both with the weight w = (1 − (r/R)²)² inside an ellipse aligned with the face axes and 0
 * outside it (r/R is the elliptical radius):
 *   inflate:  src = c + (p − c)·(1 − a·w)   (per axis gain, so lips can fill out mostly vertically)
 *   vector:   src = p − v·w
 * The displacements of all active operators are summed into one field (dx, dy) and the picture is sampled once
 * with bilinear interpolation. Smoothing runs first, on the original pixels; the warp runs on its result.
 * Every operator moves the picture by at most MAX_SHIFT face units. These are engine settings, not clinical values.
 */

/** Largest displacement of one operator at full strength, in face units. Source: SUPERPROMPT (0.06). */
export const MAX_SHIFT = 0.06;
/**
 * A vector operator never moves further than this share of its smaller radius: the mapping p → src then stays
 * one-to-one (|∇w| ≤ 1.54 / R), so the picture can neither fold over nor tear.
 */
const VECTOR_SAFE = 0.5;
/** Peak of r·w(r) / R, reached at r = R/√5: an inflate with factor a moves pixels by at most 0.286·a·R. */
const INFLATE_PEAK = 0.2862;
/** An inflate magnifies its centre by 1 / (1 − a); a ≤ 0.5 keeps that at 2× or less, so nothing looks blown up. */
const INFLATE_MAX = 0.5;

/** One column of a lip operator, face coordinates: border and mouth-line height at x, and the border's shift. */
export interface LipSample {
  x: number;
  /** Vermilion border (outer lip edge). */
  border: number;
  /** Mouth line (inner lip edge). */
  mouth: number;
  /** Shift of the border at full strength, face units, always ≥ 0 (direction given by `outward`). */
  d: number;
}

export interface Operator {
  concernId: ConcernId;
  side: Side;
  kind: 'inflate' | 'vector' | 'lip';
  /** lip: columns from one mouth corner to the other, sorted by x. */
  samples?: LipSample[];
  /** lip: −1 moves the border up (upper lip), +1 down (lower lip). */
  outward?: 1 | -1;
  /** Centre and radii, face coordinates. */
  c: Pt;
  rx: number;
  ry: number;
  /** inflate: factor a at full strength. */
  a?: number;
  /** inflate: share of the displacement kept along each face axis. */
  gain?: Pt;
  /** vector: displacement at the centre at full strength, face units along the face axes. */
  v?: Pt;
  /** MD Codes code that drives this operator in mode B (docs/TASKS.md M5b–M5c); none for the masseter (toxin). */
  site?: MdCode;
  /** lip: half-height of the soft band as a share of the local lip thickness (default LIP.band). */
  band?: number;
  /** Only in one mode: 'area' = the concern slider of mode A, 'sites' = MD Codes mode. Absent = both. */
  use?: 'area' | 'sites';
  /** Bridge between two filled codes (mode B): its strength is the weaker of the two. */
  bridge?: readonly [MdCode, MdCode];
}

const norm = (p: Pt, length: number): Pt => {
  const l = Math.hypot(p.x, p.y) || 1;
  return { x: (p.x / l) * length, y: (p.y / l) * length };
};

/** Inflate operator whose largest displacement is `shift` face units. */
function inflate(concernId: ConcernId, side: Side, c: Pt, rx: number, ry: number, shift: number, gain: Pt = { x: 1, y: 1 }): Operator {
  const a = Math.min(INFLATE_MAX, Math.min(shift, MAX_SHIFT) / (INFLATE_PEAK * Math.max(rx * gain.x, ry * gain.y)));
  return { concernId, side, kind: 'inflate', c, rx, ry, a, gain };
}

/** Vector operator moving the centre by `shift` face units toward `dir`. */
function vector(concernId: ConcernId, side: Side, c: Pt, rx: number, ry: number, dir: Pt, shift: number): Operator {
  return { concernId, side, kind: 'vector', c, rx, ry, v: norm(dir, Math.min(shift, MAX_SHIFT, VECTOR_SAFE * Math.min(rx, ry))) };
}

/** Bounding half-sizes of a region outline around its centroid. */
function extent(outline: readonly Pt[]) {
  const c = centroid(outline);
  return {
    c,
    hx: Math.max(...outline.map((p) => Math.abs(p.x - c.x))),
    hy: Math.max(...outline.map((p) => Math.abs(p.y - c.y))),
  };
}

/**
 * Lip settings (engine and aesthetic-design values, not clinical ones). `gain`: border shift as a share of the
 * local lip thickness at full strength (lip type 1); with the soft band of half-height 1.3 × thickness, a share
 * above 0.42 could fold the picture. `idealRatio`: upper : lower lip height ≈ 1 : 1.6, a common aesthetic norm.
 */
const LIP = { gain: 0.38, band: 1.3, minBand: 0.02, idealRatio: 1 / 1.6, balanceMax: 1.25 } as const;

/** Height of a polyline (sorted by x) at x, linear between points. */
function heightAt(pts: readonly Pt[], x: number): number {
  if (x <= pts[0]!.x) return pts[0]!.y;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (x <= b.x) return a.y + ((x - a.x) / Math.max(1e-9, b.x - a.x)) * (b.y - a.y);
  }
  return pts[pts.length - 1]!.y;
}

/** Lip columns from the standard contours: border and mouth line per x, for each lip, plus their mid thickness. */
export function lipShape(F: (i: number) => Pt) {
  const sorted = (set: readonly number[]) => set.map(F).sort((a, b) => a.x - b.x);
  const outerU = sorted(LIPS_OUTER_UPPER);
  const outerL = sorted(LIPS_OUTER_LOWER);
  const innerU = sorted(LIPS_INNER_UPPER);
  const innerL = sorted(LIPS_INNER_LOWER);
  const column = (border: Pt[], inner: Pt[]) => border.map((p) => ({ x: p.x, border: p.y, mouth: heightAt(inner, p.x), d: 0 }));
  const upper = column(outerU, innerU);
  const lower = column(outerL, innerL);
  const mid = (cols: { x: number; border: number; mouth: number }[]) => {
    const c = cols.reduce((t, s) => t + s.x, 0) / cols.length;
    const s = cols.reduce((best, k) => (Math.abs(k.x - c) < Math.abs(best.x - c) ? k : best));
    return Math.abs(s.border - s.mouth);
  };
  const width = outerU[outerU.length - 1]!.x - outerU[0]!.x;
  return { upper, lower, upperMid: mid(upper), lowerMid: mid(lower), width };
}

/**
 * Lip fullness: total lip height at the middle ÷ mouth width. Used to suggest the lip type (1 very thin … 5 very
 * full) shown to the doctor, who can change it.
 */
export function lipFullness(F: (i: number) => Pt): number {
  const s = lipShape(F);
  return (s.upperMid + s.lowerMid) / Math.max(1e-6, s.width);
}

/**
 * Lip operator: the border of one lip moves outward by `gain` × its local thickness. `band`: half-height of the soft
 * band (× thickness); the shift stays below 0.65 × the band, so it cannot fold. `profile`: share of the shift along
 * the lip (a local code); only the columns it reaches are kept, plus one still column on each side.
 */
function lipOperator(
  concernId: ConcernId,
  cols: Omit<LipSample, 'd'>[],
  outward: 1 | -1,
  gain: number,
  opts: { band?: number; profile?: (x: number) => number } = {},
): Operator {
  const bandK = opts.band ?? LIP.band;
  const all = cols.map((s) => ({
    ...s,
    d: Math.min(MAX_SHIFT, 0.65 * bandK * Math.abs(s.border - s.mouth), gain * (opts.profile ? opts.profile(s.x) : 1) * Math.abs(s.border - s.mouth)),
  }));
  const first = Math.max(0, all.findIndex((s) => s.d > 0) - 1);
  const last = Math.min(all.length - 1, all.length - [...all].reverse().findIndex((s) => s.d > 0));
  const samples = all.slice(first, last + 1);
  const xs = samples.map((s) => s.x);
  const band = (s: LipSample) => Math.max(LIP.minBand, bandK * Math.abs(s.border - s.mouth));
  const top = Math.min(...samples.map((s) => s.border - band(s)));
  const bottom = Math.max(...samples.map((s) => s.border + band(s)));
  const c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (top + bottom) / 2 };
  return { concernId, side: 'M', kind: 'lip', c, rx: (Math.max(...xs) - Math.min(...xs)) / 2 + 0.005, ry: (bottom - top) / 2, samples, outward, band: bandK };
}

/** Patient's sex as recorded in the case; it shapes the chin and the jaw angle (a man's are wider and squarer). */
export type Sex = 'female' | 'male' | 'other';

/**
 * Operators for the concerns whose effect in PRD §6 includes W. Directions were proposed in the M4 plan
 * (2026-11-15) and are checked by eye on the test photos:
 *   lips: fill out (upper and lower lip, mostly vertically) · cheek: fill out, lift up and out ·
 *   nasolabial: lift the tissue beside the fold up and out · marionette: lift the mouth corner ·
 *   chin: lower border down evenly and a little wider (wider still for a man) · jawline: jowl lifted straight up,
 *   jaw angle a little fuller outward · masseter: lateral contour in (slimmer) · temple: fill out · brow: lift the tail.
 * Owner review 2026-11-15: the first version pulled only the middle of the chin down (a pointed, feminine chin on
 * a man) and moved the jowl and the masseter inward, which made the jaw line concave. Fixed as above.
 *
 * Mode B (MD Codes, docs/TASKS.md M5b–M5c): every code has its own operators in its own zone. An operator that is
 * exactly one code's effect serves both modes (`site`, no `use`); the others are `use: 'area'` (mode A) or
 * `use: 'sites'` (mode B). The F, G, O, Tt and Lp8 codes smooth instead (pipeline.ts `CODE_SMOOTHING`).
 */
export function buildOperators(set: RegionSet, lm: readonly Pt[], sex: Sex = 'other'): Operator[] {
  const male = sex === 'male';
  const mouth = lerp(toFace(set.frame, lm[ANCHOR.rMouth]!), toFace(set.frame, lm[ANCHOR.lMouth]!), 0.5);
  const chin = toFace(set.frame, lm[ANCHOR.chin]!);
  // Face outline (the skin region): the point on one side at a given height.
  const face = set.regions.find((r) => r.concernId === 'skin-quality');
  const contourAt = (side: 'R' | 'L') => {
    if (!face) return null;
    return (y: number): Pt => {
      const xs = crossingsAtY(face.outline, y);
      const x = xs.length ? (side === 'R' ? Math.min(...xs) : Math.max(...xs)) : 0;
      return { x, y };
    };
  };
  const F = (i: number) => toFace(set.frame, lm[i]!);
  const ops: Operator[] = [];
  const region = (id: ConcernId, side: Side) => set.regions.find((r) => r.concernId === id && r.side === side);
  const area = (op: Operator): Operator => ({ ...op, use: 'area' });
  const both = (op: Operator, site: MdCode): Operator => ({ ...op, site });
  const only = (op: Operator, site: MdCode): Operator => ({ ...op, site, use: 'sites' });

  // 8 — lips, the way a lip designer works: the vermilion border moves outward everywhere along the lip, by a share
  // of the lip's own thickness at that point. The shape is kept (Cupid's bow, the fine corners), the corners grow
  // only as much as they are thick, and there is no bulge in the middle. The first version inflated each lip around
  // its centre: thin at the corners, suddenly full in the middle (owner review 2026-11-15). The upper lip gets a
  // larger share when it is thinner than the common aesthetic ratio upper : lower ≈ 1 : 1.6, and the reverse.
  if (region('lip-volume', 'M')) {
    const lips = lipShape(F);
    const ratio = lips.upperMid / Math.max(1e-6, lips.lowerMid);
    const balance = Math.min(LIP.balanceMax, Math.max(1 / LIP.balanceMax, Math.sqrt(LIP.idealRatio / ratio)));
    ops.push(both(lipOperator('lip-volume', lips.upper, -1, LIP.gain * balance), 'Lp1'));
    ops.push(both(lipOperator('lip-volume', lips.lower, 1, LIP.gain / balance), 'Lp1'));
    ops.push(...lipCodes(lips, F));
  }

  // 10 — chin: the whole lower border moves down evenly (a wide vector, so the chin does not become pointed) and
  // the chin widens a little; for a man less length and more width, which keeps it square.
  const chinRegion = region('chin', 'M');
  if (chinRegion) {
    const { c, hx, hy } = extent(chinRegion.outline);
    ops.push(both(vector('chin', 'M', { x: c.x, y: c.y + hy * 0.3 }, hx * 2.2, hy * 1.3, { x: 0, y: 1 }, male ? 0.02 : 0.03), 'C2'));
    ops.push(area(inflate('chin', 'M', c, hx * (male ? 1.8 : 1.4), hy * 1.2, male ? 0.03 : 0.018, { x: 1, y: 0.25 })));
    ops.push(...chinCodes(c, hx, hy, male));
  }

  // Nose (N1–N5, mode B only): no concern in PRD §6, so no mode-A operator.
  ops.push(...noseCodes(F));

  for (const side of ['R', 'L'] as const) {
    const s = side === 'R' ? -1 : 1;
    const cheek = region('midface-volume', side);
    const contour = contourAt(side);
    if (cheek) {
      const { c, hx, hy } = extent(cheek.outline);
      // Mode A: the whole cheek at once.
      ops.push(area(inflate('midface-volume', side, c, hx * 1.4, hy * 1.4, 0.03)));
      ops.push(area(vector('midface-volume', side, c, hx * 1.6, hy * 1.6, { x: s * 0.3, y: -1 }, 0.035)));
      ops.push(...cheekSites(side, c, contour, mouth.y));
    }
    const fold = region('nasolabial-fold', side);
    if (fold) {
      const { c, hx, hy } = extent(fold.outline);
      ops.push(area(vector('nasolabial-fold', side, { x: c.x + s * hx * 0.6, y: c.y - hy * 0.2 }, Math.max(0.14, hx * 1.6), Math.max(0.16, hy * 1.1), { x: s * 0.35, y: -1 }, 0.03)));
      ops.push(...foldCodes(side, (side === 'R' ? R_NASOLABIAL : L_NASOLABIAL).map(F)));
    }
    if (region('marionette', side)) {
      const corner = F(side === 'R' ? ANCHOR.rMouth : ANCHOR.lMouth);
      // Support below the corner, in the marionette groove, so the lip line keeps its own shape. The first version
      // lifted the commissure itself and faded out within ~0.06 toward the lip centre: the corner curled into a
      // sharp V with a dark crease (owner review 2026-11-16, measured in the M5b session). Now the corner moves
      // ~0.004 units and the groove below it ~0.015.
      ops.push(area(vector('marionette', side, { x: corner.x + s * 0.015, y: corner.y + 0.09 }, 0.16, 0.12, { x: 0, y: -1 }, 0.018)));
      for (const [i, m] of MARIONETTE.entries())
        ops.push(only(vector('marionette', side, { x: corner.x + s * m.out, y: corner.y + m.down }, m.rx, m.ry, { x: 0, y: -1 }, m.lift), MARIONETTE_CODES[i]!));
    }
    // Jaw operators sit on the face outline itself. The jowl and masseter regions are placed geometrically and
    // land near the mouth corners on close-up photos (M1 open point), so operators built from them pushed the
    // middle of the lower cheek and left a dent (owner review 2 2026-11-15).
    if (contour && region('jawline', side)) {
      // Jowl: the soft tissue just inside the jaw line is lifted; the outline itself hardly moves, so no notch.
      const j = contour(mouth.y + (chin.y - mouth.y) * 0.55);
      ops.push(both(vector('jawline', side, { x: j.x - s * 0.12, y: j.y }, 0.14, 0.18, { x: 0, y: -1 }, 0.025), 'Jw4'));
      // Jaw angle a little fuller outward, so the line from the angle to the chin reads defined.
      const a = contour(mouth.y);
      ops.push(both(vector('jawline', side, { x: a.x - s * 0.03, y: a.y }, 0.12, 0.2, { x: s, y: 0.4 }, male ? 0.025 : 0.015), 'Jw1'));
      ops.push(...jawCodes(side, contour, mouth.y, chin.y));
    }
    if (contour && region('masseter', side)) {
      // Masseter: the outline at the level of the muscle moves in over a tall ellipse, so the side of the face
      // narrows evenly instead of getting a dent. Toxin, no MD Codes family: the same in both modes.
      const m = contour(mouth.y - 0.08);
      ops.push(vector('masseter', side, { x: m.x - s * 0.06, y: m.y }, 0.14, 0.3, { x: -s, y: 0 }, 0.025));
    }
    const temple = region('temple', side);
    if (temple) {
      const { c, hx, hy } = extent(temple.outline);
      ops.push(area(inflate('temple', side, c, hx * 1.3, hy * 1.3, 0.03, { x: 1, y: 0.5 })));
      // T1 anterior (low, next to the brow tail and the orbital rim) and T2 posterior (high, toward the hairline
      // and the face edge): in a frontal photo the temple is a tall, narrow strip, so the two parts follow its
      // length. Together about mode A; each at least TEMPLE.minR across, so it fills softly.
      const r = Math.max(TEMPLE.minR, hx * TEMPLE.r);
      ops.push(only(inflate('temple', side, { x: c.x - s * hx * TEMPLE.apartX, y: c.y + hy * TEMPLE.apartY }, r, hy * TEMPLE.ry, TEMPLE.shift, { x: 1, y: 0.5 }), 'T1'));
      ops.push(only(inflate('temple', side, { x: c.x + s * hx * TEMPLE.apartX, y: c.y - hy * TEMPLE.apartY }, r, hy * TEMPLE.ry, TEMPLE.shift, { x: 1, y: 0.5 }), 'T2'));
    }
    const brow = region('brow', side);
    if (brow && brow.shape.type === 'polygon') {
      // The brow polygon starts at the tail of its upper edge and reaches the head at the end of that edge.
      const { hx, hy } = extent(brow.outline);
      const upper = brow.shape.pts.slice(0, BROW_UPPER_POINTS);
      const tail = upper[0]!;
      const mid = upper[Math.floor(upper.length / 2)]!;
      const head = upper[upper.length - 1]!;
      ops.push(both(vector('brow', side, { x: tail.x - s * hx * 0.25, y: tail.y + hy * 0.3 }, hx * 0.9, Math.max(0.12, hy * 2.2), { x: 0, y: -1 }, 0.035), 'E1'));
      // E2 lifts the middle of the brow; E3 the head (owner 2026-11-16: the doctor switches it off when not wanted).
      ops.push(only(vector('brow', side, { x: mid.x, y: mid.y + hy * 0.3 }, hx * 0.6, Math.max(0.12, hy * 2.2), { x: 0, y: -1 }, 0.025), 'E2'));
      ops.push(only(vector('brow', side, { x: head.x + s * hx * 0.15, y: head.y + hy * 0.3 }, hx * 0.45, Math.max(0.1, hy * 2), { x: 0, y: -1 }, 0.02), 'E3'));
    }
  }
  return [...ops, ...bridges(ops)];
}

/** Points on the upper edge of the brow polygon (regions.ts: upper edge tail → head, then the lower edge back). */
const BROW_UPPER_POINTS = 5;

/** Temple codes (engine values): centre offsets and radii × the region's half-sizes; least radius (face units). */
const TEMPLE = { apartX: 0.3, apartY: 0.4, r: 1.1, minR: 0.07, ry: 0.8, shift: 0.02 } as const;

/**
 * Marionette codes M1–M3 down the line below the mouth corner (face units): offset out and down, radii, lift. All
 * stay below the commissure with a wide horizontal radius and a small lift; one centred on the corner with a short
 * radius curls the corner up (owner review 2026-11-16). M1's ellipse just reaches the corner, so it hardly moves.
 */
const MARIONETTE_CODES = ['M1', 'M2', 'M3'] as const;
const MARIONETTE = [
  { out: 0.015, down: 0.07, rx: 0.1, ry: 0.07, lift: 0.012 },
  { out: 0.03, down: 0.12, rx: 0.1, ry: 0.07, lift: 0.014 },
  { out: 0.045, down: 0.17, rx: 0.09, ry: 0.07, lift: 0.012 },
] as const;

/** Length-weighted point at share `t` of a polyline. */
function along(path: readonly Pt[], t: number): Pt {
  const lengths = path.slice(1).map((p, i) => Math.hypot(p.x - path[i]!.x, p.y - path[i]!.y));
  let left = t * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i]! || i === lengths.length - 1) return lerp(path[i]!, path[i + 1]!, Math.min(1, left / Math.max(1e-9, lengths[i]!)));
    left -= lengths[i]!;
  }
  return path[path.length - 1]!;
}

/**
 * NL1–NL3: the nasolabial lift split into the upper, central and lower third of the fold (the approved fold
 * landmarks, from beside the nose wing to past the mouth corner). Each lifts the tissue beside its third up and
 * out, a little outside the groove, like the mode-A operator.
 */
function foldCodes(side: 'R' | 'L', path: readonly Pt[]): Operator[] {
  const s = side === 'R' ? -1 : 1;
  const length = path.slice(1).reduce((t, p, i) => t + Math.hypot(p.x - path[i]!.x, p.y - path[i]!.y), 0);
  const ry = Math.max(0.08, (length / 3) * 0.9);
  return (['NL1', 'NL2', 'NL3'] as const).map((site, i) => {
    const p = along(path, (2 * i + 1) / 6);
    return { ...vector('nasolabial-fold', side, { x: p.x + s * 0.04, y: p.y }, 0.1, ry, { x: s * 0.35, y: -1 }, 0.025), site, use: 'sites' as const };
  });
}

/**
 * Chin codes besides C2 (engine and aesthetic-design values, placed by eye on the test photos, 2026-11-16).
 * `c`, `hx`, `hy`: centre and half-sizes of the chin region. A man's C3 is wider, so the chin stays square.
 *   C1 labiomental angle: fills the crease under the lower lip, mostly vertically.
 *   C3 anterior chin: one fill on each side of the midline, mostly sideways (with C2 about mode A's chin).
 *   C4 soft tissue pogonion: a central fullness.
 *   C5 lateral lower chin: the lower border on each side moves down and a little out (squarer outline).
 *   C6 lateral chin: fills the side of the chin, mostly sideways.
 */
function chinCodes(c: Pt, hx: number, hy: number, male: boolean): Operator[] {
  const tag = (op: Operator, site: MdCode): Operator => ({ ...op, site, use: 'sites' });
  const out: Operator[] = [
    tag(inflate('chin', 'M', { x: c.x, y: c.y - hy * 0.85 }, hx * 0.8, hy * 0.4, 0.008, { x: 0.3, y: 1 }), 'C1'),
    tag(inflate('chin', 'M', { x: c.x, y: c.y + hy * 0.2 }, hx * 0.7, hy * 0.7, 0.012), 'C4'),
  ];
  for (const side of ['R', 'L'] as const) {
    const s = side === 'R' ? -1 : 1;
    out.push(tag(inflate('chin', side, { x: c.x + s * hx * 0.45, y: c.y }, hx * (male ? 1 : 0.8), hy * 1.1, male ? 0.02 : 0.012, { x: 1, y: 0.25 }), 'C3'));
    out.push(tag(vector('chin', side, { x: c.x + s * hx * 0.6, y: c.y + hy * 0.7 }, hx * 0.5, hy * 0.6, { x: s * 0.3, y: 1 }, 0.015), 'C5'));
    out.push(tag(inflate('chin', side, { x: c.x + s * hx * 0.85, y: c.y }, hx * 0.5, hy * 0.8, 0.012, { x: 1, y: 0.3 }), 'C6'));
  }
  return out;
}

/**
 * Jaw codes besides Jw1 (angle) and Jw4 (prejowl, the jowl lift), all on the face outline (engine values):
 *   Jw2 pre-auricular area: above the angle, a little fuller outward.
 *   Jw3 mandible body: between the angle and the jowl, the border down and out (a sharper line).
 *   Jw5 lower anterior chin: the border beside the chin, down.
 */
function jawCodes(side: 'R' | 'L', contour: (y: number) => Pt, mouthY: number, chinY: number): Operator[] {
  const s = side === 'R' ? -1 : 1;
  const at = (y: number) => {
    const p = contour(y);
    return { x: p.x - s * 0.03, y: p.y };
  };
  const tag = (op: Operator, site: MdCode): Operator => ({ ...op, site, use: 'sites' });
  return [
    tag(vector('jawline', side, at(mouthY - 0.22), 0.08, 0.14, { x: s, y: 0 }, 0.012), 'Jw2'),
    tag(vector('jawline', side, at(mouthY + (chinY - mouthY) * 0.3), 0.1, 0.1, { x: s * 0.5, y: 1 }, 0.012), 'Jw3'),
    tag(vector('jawline', side, at(mouthY + (chinY - mouthY) * 0.85), 0.08, 0.08, { x: 0, y: 1 }, 0.012), 'Jw5'),
  ];
}

/**
 * Nose codes (mode B only, all start off; engine values). In a frontal photo a filler of the nose shows mostly as
 * a slightly lifted base and a straighter, narrower-looking dorsum, so:
 *   N1 anterior nasal spine and N2 columella: the base of the nose lifts a little.
 *   N3 frontonasal angle: a small fill at the nasal root.
 *   N4 bony and N5 cartilaginous dorsum: the dorsum narrows a little (a sideways pinch, never a fold: |a| ≤ 0.5).
 */
function noseCodes(F: (i: number) => Pt): Operator[] {
  const tip = F(ANCHOR.noseTip);
  const base = F(ANCHOR.subnasale);
  const root = F(ANCHOR.nasion);
  const tag = (op: Operator, site: MdCode): Operator => ({ ...op, site, use: 'sites' });
  const length = Math.max(0.1, base.y - root.y);
  return [
    tag(vector('skin-quality', 'M', base, 0.08, 0.06, { x: 0, y: -1 }, 0.01), 'N1'),
    tag(vector('skin-quality', 'M', lerp(tip, base, 0.5), 0.05, 0.06, { x: 0, y: -1 }, 0.01), 'N2'),
    tag(inflate('skin-quality', 'M', root, 0.07, 0.07, 0.005), 'N3'),
    tag(inflate('skin-quality', 'M', lerp(root, tip, 0.33), 0.1, length * 0.3, -0.008, { x: 1, y: 0 }), 'N4'),
    tag(inflate('skin-quality', 'M', lerp(root, tip, 0.7), 0.1, length * 0.3, -0.008, { x: 1, y: 0 }), 'N5'),
  ];
}

/**
 * Shares of the local lip thickness for the lip codes at full strength (engine values). Every lip operator of
 * one lip adds its shift ÷ band to the same columns; Lp1 takes up to 0.365 of that (0.38 × the 1.25 balance ÷
 * 1.3), so the codes get the rest of a total that keeps the picture from folding with every lip code at the cap
 * (det > 0.3 in warp.test.ts). They are fine touches on top of Lp1, not a second fill.
 */
const LIP_CODES = { bow: 0.08, border: 0.05, borderBand: 0.9, tubercle: 0.08 } as const;

/**
 * Lip codes besides Lp1 (the whole vermilion border, shared with mode A). All follow the lip's own contour and
 * thickness (owner rule F4.12); the local ones fade in and out along the lip with a cos² profile, so there is no
 * step (engine values, checked by eye):
 *   Lp2 Cupid's bow: the upper border rises at the two peaks only, so the bow reads sharper.
 *   Lp3 lip border: a thin band at the border of both lips moves outward a little (a defined edge).
 *   Lp4 medial tubercle: the middle of the upper lip a little fuller.
 *   Lp5 lateral tubercles: the lower lip a little fuller on each side of the middle.
 *   Lp6 oral commissure: the corner is supported from just below it (it never curls up).
 *   Lp7 philtrum column: each column a little fuller (narrow, mostly sideways).
 * Lp8 (perioral lines) smooths its zone instead.
 */
function lipCodes(lips: ReturnType<typeof lipShape>, F: (i: number) => Pt): Operator[] {
  const xs = lips.upper.map((c) => c.x);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  const w = lips.width;
  const bump = (centre: number, half: number) => (x: number) => (Math.abs(x - centre) < half ? Math.cos(((x - centre) / half) * (Math.PI / 2)) ** 2 : 0);
  // The two peaks of Cupid's bow: the highest points of the upper border on each side of the middle.
  const peak = (side: -1 | 1) => {
    const own = lips.upper.filter((c) => side * (c.x - mid) > w * 0.04);
    const pool = own.length ? own : lips.upper;
    return pool.reduce((best, c) => (c.border < best.border ? c : best));
  };
  const pR = peak(-1);
  const pL = peak(1);
  const bowHalf = Math.max(0.02, ((Math.abs(pR.x - mid) + Math.abs(pL.x - mid)) / 2) * 0.9);
  const bow = (x: number) => bump(pR.x, bowHalf)(x) + bump(pL.x, bowHalf)(x);
  const tag = (op: Operator, site: MdCode): Operator => ({ ...op, site, use: 'sites' });
  const sub = F(ANCHOR.subnasale);
  const out: Operator[] = [
    tag(lipOperator('lip-volume', lips.upper, -1, LIP_CODES.bow, { profile: bow }), 'Lp2'),
    tag(lipOperator('lip-volume', lips.upper, -1, LIP_CODES.border, { band: LIP_CODES.borderBand }), 'Lp3'),
    tag(lipOperator('lip-volume', lips.lower, 1, LIP_CODES.border, { band: LIP_CODES.borderBand }), 'Lp3'),
    tag(lipOperator('lip-volume', lips.upper, -1, LIP_CODES.tubercle, { profile: bump(mid, w * 0.2) }), 'Lp4'),
  ];
  for (const side of ['R', 'L'] as const) {
    const s = side === 'R' ? -1 : 1;
    const corner = F(side === 'R' ? ANCHOR.rMouth : ANCHOR.lMouth);
    const p = side === 'R' ? pR : pL;
    out.push(tag({ ...lipOperator('lip-volume', lips.lower, 1, LIP_CODES.tubercle, { profile: bump(mid + s * w * 0.22, w * 0.16) }), side }, 'Lp5'));
    // Lp6: the corner is supported from below, never lifted at the commissure itself (that curls it, owner 2026-11-16).
    out.push(tag(vector('lip-volume', side, { x: corner.x, y: corner.y + 0.05 }, 0.1, 0.06, { x: 0, y: -1 }, 0.008), 'Lp6'));
    const half = Math.max(0.02, (p.border - sub.y) / 2);
    out.push(tag(inflate('lip-volume', side, { x: p.x, y: (p.border + sub.y) / 2 }, 0.04, half * 1.1, 0.003, { x: 1, y: 0.2 }), 'Lp7'));
  }
  return out;
}

/**
 * Cheek of mode B, five codes (engine and aesthetic-design values, not clinical ones; placed by eye on the test
 * photos, 2026-11-16). `c` is the centre of the cheek region.
 *   Ck1 zygomatic arch: lateral, near the face outline, projects mostly sideways (wider upper face).
 *   Ck2 zygomatic eminence: the cheek apex, a little up and out from the centre; fills and lifts up and out.
 *   Ck3 anteromedial cheek: medial, below the under-eye strip; fills and supports upward.
 *   Ck4 lateral lower cheek: near the outline, halfway from the cheek down to the mouth; mostly sideways.
 *   Ck5 submalar area: halfway down to the mouth, a little medial of the cheek centre (clear of Ck4 on a full
 *     face); fills the hollow.
 * Ck1–Ck3 at the same strength come close to the mode-A cheek; Ck4 and Ck5 start off.
 */
const CHEEK_SITES = {
  ck1: { up: 0.09, inFromEdge: 0.07, rx: 0.12, ry: 0.1, shift: 0.018, gainY: 0.4 },
  ck2: { out: 0.03, up: 0.04, rx: 0.16, ry: 0.14, shift: 0.02, liftR: 0.2, lift: 0.018 },
  ck3: { in: 0.13, up: 0.01, rx: 0.12, ry: 0.12, shift: 0.016, liftR: 0.15, lift: 0.012 },
  ck4: { down: 0.55, inFromEdge: 0.08, rx: 0.11, ry: 0.13, shift: 0.012, gainY: 0.4 },
  ck5: { down: 0.5, out: -0.04, rx: 0.12, ry: 0.11, shift: 0.016 },
} as const;

function cheekSites(side: 'R' | 'L', c: Pt, contour: ((y: number) => Pt) | null, mouthY: number): Operator[] {
  const s = side === 'R' ? -1 : 1;
  const { ck1: k1, ck2: k2, ck3: k3, ck4: k4, ck5: k5 } = CHEEK_SITES;
  const tag = (op: Operator, site: MdCode): Operator => ({ ...op, site, use: 'sites' });
  const edge = (y: number) => (contour ? contour(y).x : c.x + s * 0.25);
  const c1 = { x: edge(c.y - k1.up) - s * k1.inFromEdge, y: c.y - k1.up };
  const c2 = { x: c.x + s * k2.out, y: c.y - k2.up };
  const c3 = { x: c.x - s * k3.in, y: c.y - k3.up };
  const y4 = c.y + (mouthY - c.y) * k4.down;
  const c4 = { x: edge(y4) - s * k4.inFromEdge, y: y4 };
  const c5 = { x: c.x + s * k5.out, y: c.y + (mouthY - c.y) * k5.down };
  return [
    tag(inflate('midface-volume', side, c1, k1.rx, k1.ry, k1.shift, { x: 1, y: k1.gainY }), 'Ck1'),
    tag(inflate('midface-volume', side, c2, k2.rx, k2.ry, k2.shift), 'Ck2'),
    tag(vector('midface-volume', side, c2, k2.liftR, k2.liftR * 0.9, { x: s * 0.3, y: -1 }, k2.lift), 'Ck2'),
    tag(inflate('midface-volume', side, c3, k3.rx, k3.ry, k3.shift), 'Ck3'),
    tag(vector('midface-volume', side, c3, k3.liftR, k3.liftR, { x: 0, y: -1 }, k3.lift), 'Ck3'),
    tag(inflate('midface-volume', side, c4, k4.rx, k4.ry, k4.shift, { x: 1, y: k4.gainY }), 'Ck4'),
    tag(inflate('midface-volume', side, c5, k5.rx, k5.ry, k5.shift), 'Ck5'),
  ];
}

/**
 * Neighbouring codes that blend into one fill when both get volume (owner rule 2026-11-16, PRD F4.12). Each
 * inflate pushes its rim outward, so two filled codes squeeze the skin between them and the result reads as two
 * bumps with a groove. A bridge is an inflate over the gap; it runs at the weaker of the two strengths, so it
 * is off as soon as one of them is 0.
 */
export const BRIDGES: readonly (readonly [MdCode, MdCode])[] = [
  ['T1', 'T2'],
  ['T1', 'Ck1'],
  ['Ck1', 'Ck2'],
  ['Ck2', 'Ck3'],
  ['Ck3', 'NL1'],
  ['Ck1', 'Ck4'],
  ['Ck2', 'Ck5'],
  ['Ck4', 'Ck5'],
  ['M3', 'C3'],
  ['C4', 'C3'],
  ['C3', 'C6'],
  ['C3', 'Jw4'],
];
/**
 * Bridge settings (engine values): margin around the segment between the two centres (× the smaller site
 * radius), the largest shift and the number of steps tried up to it. Each bridge gets the smallest shift that
 * leaves the skin between the two sites unsqueezed (det ≤ `target` on the inner part of the segment, `inner`; a
 * little below 1 so the pixel grid cannot tip it over), measured on this face; sites that already overlap into one
 * fill get none.
 */
const BRIDGE = { margin: 0.8, maxShift: 0.03, steps: 15, inner: 0.15, target: 0.99 } as const;

/** Displacement p − src of one operator at full strength, face units (lip operators excluded: no bridge uses them). */
export function displacement(op: Operator, q: Pt): Pt {
  if (op.kind === 'lip') return { x: 0, y: 0 };
  const u = q.x - op.c.x;
  const t = q.y - op.c.y;
  const r2 = (u / op.rx) ** 2 + (t / op.ry) ** 2;
  if (r2 >= 1) return { x: 0, y: 0 };
  const k = (1 - r2) * (1 - r2);
  if (op.kind === 'inflate') return { x: u * op.a! * k * (op.gain?.x ?? 1), y: t * op.a! * k * (op.gain?.y ?? 1) };
  return { x: op.v!.x * k, y: op.v!.y * k };
}

/** Largest det(I − ∇d) on the inner part of the segment a → b: above 1 the skin there is squeezed. */
function squeezeBetween(ops: readonly Operator[], a: Pt, b: Pt): number {
  const h = 0.002;
  const d = (q: Pt) => ops.reduce((s, op) => {
    const v = displacement(op, q);
    return { x: s.x + v.x, y: s.y + v.y };
  }, { x: 0, y: 0 });
  let worst = 0;
  for (let i = 0; i <= 20; i++) {
    const q = lerp(a, b, BRIDGE.inner + ((1 - 2 * BRIDGE.inner) * i) / 20);
    const xp = d({ x: q.x + h, y: q.y });
    const xm = d({ x: q.x - h, y: q.y });
    const yp = d({ x: q.x, y: q.y + h });
    const ym = d({ x: q.x, y: q.y - h });
    const det = (1 - (xp.x - xm.x) / (2 * h)) * (1 - (yp.y - ym.y) / (2 * h)) - ((yp.x - ym.x) / (2 * h)) * ((xp.y - xm.y) / (2 * h));
    worst = Math.max(worst, det);
  }
  return worst;
}

function bridges(ops: readonly Operator[]): Operator[] {
  const ofSite = (site: MdCode, side: 'R' | 'L') => ops.filter((o) => o.site === site && o.use !== 'area' && (o.side === side || o.side === 'M'));
  // Centre of a site on one side: its first inflate, or its first operator (midline sites serve both sides).
  const centre = (own: readonly Operator[]) => own.find((o) => o.kind === 'inflate') ?? own.find((o) => o.kind !== 'lip') ?? null;
  const out: Operator[] = [];
  for (const side of ['R', 'L'] as const)
    for (const pair of BRIDGES) {
      const both = [...ofSite(pair[0], side), ...ofSite(pair[1], side)];
      const a = centre(ofSite(pair[0], side));
      const b = centre(ofSite(pair[1], side));
      if (!a || !b) continue;
      const r = BRIDGE.margin * Math.min(a.rx, a.ry, b.rx, b.ry);
      const c = lerp(a.c, b.c, 0.5);
      const make = (shift: number) => inflate(b.concernId, side, c, Math.abs(a.c.x - b.c.x) / 2 + r, Math.abs(a.c.y - b.c.y) / 2 + r, shift);
      if (squeezeBetween(both, a.c, b.c) <= 1) continue;
      let op = make(BRIDGE.maxShift);
      for (let i = 1; i <= BRIDGE.steps; i++) {
        const candidate = make((BRIDGE.maxShift * i) / BRIDGE.steps);
        if (squeezeBetween([...both, candidate], a.c, b.c) <= BRIDGE.target) {
          op = candidate;
          break;
        }
      }
      out.push({ ...op, use: 'sites', bridge: pair });
    }
  return out;
}

/**
 * Operator placed in pixels of a working box, with its displacement at full strength computed once per photo.
 * Both operators are linear in their strength, so a slider move only scales and adds these maps.
 */
export interface PlacedOperator {
  op: Operator;
  /** Bounding box in box pixels, clipped to the box. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Displacement p − src at full strength, pixels, for the bounding box (row-major, width x1 − x0). */
  dx: Float32Array;
  dy: Float32Array;
}

/**
 * Places operators in a working box whose top-left corner is `offset` in image pixels and computes their
 * displacement maps. The frame axes are unit vectors in pixels; radii are converted with the frame unit.
 */
export function placeOperators(ops: readonly Operator[], frame: FaceFrame, offset: Pt, width: number, height: number): PlacedOperator[] {
  const { origin, xAxis, yAxis, unit } = frame;
  return ops.map((op) => {
    const cx = origin.x + (op.c.x * xAxis.x + op.c.y * yAxis.x) * unit - offset.x;
    const cy = origin.y + (op.c.x * xAxis.y + op.c.y * yAxis.y) * unit - offset.y;
    // The ellipse rotated with the face fits in a box of these half-sizes.
    const hw = Math.hypot(op.rx * xAxis.x, op.ry * yAxis.x) * unit;
    const hh = Math.hypot(op.rx * xAxis.y, op.ry * yAxis.y) * unit;
    const x0 = Math.max(0, Math.floor(cx - hw));
    const y0 = Math.max(0, Math.floor(cy - hh));
    const x1 = Math.max(x0, Math.min(width, Math.ceil(cx + hw) + 1));
    const y1 = Math.max(y0, Math.min(height, Math.ceil(cy + hh) + 1));
    const bw = x1 - x0;
    const dx = new Float32Array(bw * (y1 - y0));
    const dy = new Float32Array(bw * (y1 - y0));
    const irx = 1 / (op.rx * unit);
    const iry = 1 / (op.ry * unit);
    const a = op.a ?? 0;
    const gx = op.gain?.x ?? 1;
    const gy = op.gain?.y ?? 1;
    const v = op.v ?? { x: 0, y: 0 };
    const vx = (v.x * xAxis.x + v.y * yAxis.x) * unit;
    const vy = (v.x * xAxis.y + v.y * yAxis.y) * unit;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const px = x - cx;
        const py = y - cy;
        // Offsets along the face axes, in pixels.
        const u = px * xAxis.x + py * xAxis.y;
        const t = px * yAxis.x + py * yAxis.y;
        if (op.kind === 'lip') {
          const shift = lipShift(op, op.c.x + u / unit, op.c.y + t / unit) * unit;
          if (shift === 0) continue;
          const i = (y - y0) * bw + (x - x0);
          dx[i] = shift * yAxis.x;
          dy[i] = shift * yAxis.y;
          continue;
        }
        const r2 = (u * irx) ** 2 + (t * iry) ** 2;
        if (r2 >= 1) continue;
        const k = (1 - r2) * (1 - r2);
        const i = (y - y0) * bw + (x - x0);
        if (op.kind === 'inflate') {
          // p − src = (p − c)·a·w, scaled per face axis.
          const du = u * a * k * gx;
          const dt = t * a * k * gy;
          dx[i] = du * xAxis.x + dt * yAxis.x;
          dy[i] = du * xAxis.y + dt * yAxis.y;
        } else {
          dx[i] = vx * k;
          dy[i] = vy * k;
        }
      }
    }
    return { op, x0, y0, x1, y1, dx, dy };
  });
}

/**
 * Shift of a lip operator at a point (face coordinates), along the face's y axis, in face units. Across the lip the
 * shift interpolates the columns; vertically it is d · (1 − s²)² with s = distance from the border ÷ the band
 * half-height (1.3 × the local thickness), so the border moves by d and the mouth line hardly at all.
 */
function lipShift(op: Operator, qx: number, qy: number): number {
  const s = op.samples!;
  if (qx <= s[0]!.x || qx >= s[s.length - 1]!.x) return 0;
  let j = 1;
  while (s[j]!.x < qx) j++;
  const a = s[j - 1]!;
  const b = s[j]!;
  const f = (qx - a.x) / Math.max(1e-9, b.x - a.x);
  const border = a.border + (b.border - a.border) * f;
  const thick = Math.abs(a.border - a.mouth) + (Math.abs(b.border - b.mouth) - Math.abs(a.border - a.mouth)) * f;
  const d = a.d + (b.d - a.d) * f;
  const h = Math.max(LIP.minBand, (op.band ?? LIP.band) * thick);
  const r = (qy - border) / h;
  if (r * r >= 1) return 0;
  return op.outward! * d * (1 - r * r) * (1 - r * r);
}

export interface Field {
  width: number;
  height: number;
  dx: Float32Array;
  dy: Float32Array;
}

export const newField = (width: number, height: number): Field => ({ width, height, dx: new Float32Array(width * height), dy: new Float32Array(width * height) });

/**
 * Adds `strength` × the displacement of one placed operator to the field. The field holds p − src: the pixel at p
 * shows what was at p − (dx, dy).
 */
export function addOperator(field: Field, placed: PlacedOperator, strength: number): void {
  if (strength <= 0) return;
  const { x0, y0, x1, y1, dx, dy } = placed;
  const bw = x1 - x0;
  const w = field.width;
  for (let y = y0; y < y1; y++) {
    const o = y * w + x0;
    const r = (y - y0) * bw;
    for (let col = 0; col < bw; col++) {
      const ddx = dx[r + col]!;
      const ddy = dy[r + col]!;
      if (ddx === 0 && ddy === 0) continue;
      field.dx[o + col] = field.dx[o + col]! + ddx * strength;
      field.dy[o + col] = field.dy[o + col]! + ddy * strength;
    }
  }
}

/**
 * Samples `src` (RGBA, field size) through the field into `out`, inside [x0, x1) × [y0, y1) only. Pixels with no
 * displacement are copied unchanged, so zero strength returns the input exactly. Bilinear, clamped to the box.
 */
export function applyField(src: Uint8ClampedArray, out: Uint8ClampedArray, field: Field, x0: number, y0: number, x1: number, y1: number): void {
  const { width: w, height: h, dx, dy } = field;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * w + x;
      const ddx = dx[i]!;
      const ddy = dy[i]!;
      if (ddx === 0 && ddy === 0) continue;
      const sx = Math.min(w - 1, Math.max(0, x - ddx));
      const sy = Math.min(h - 1, Math.max(0, y - ddy));
      const ix = Math.min(w - 2, Math.floor(sx));
      const iy = Math.min(h - 2, Math.floor(sy));
      const fx = sx - ix;
      const fy = sy - iy;
      const a = (iy * w + ix) * 4;
      const b = a + 4;
      const c = a + w * 4;
      const d = c + 4;
      const o = i * 4;
      for (let ch = 0; ch < 3; ch++) {
        const top = src[a + ch]! + (src[b + ch]! - src[a + ch]!) * fx;
        const bottom = src[c + ch]! + (src[d + ch]! - src[c + ch]!) * fx;
        out[o + ch] = top + (bottom - top) * fy;
      }
    }
  }
}
