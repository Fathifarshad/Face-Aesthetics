import type { MdSite } from '../data/mdCodes';
import type { ConcernId } from '../data/types';
import { ANCHOR, LIPS_INNER_LOWER, LIPS_INNER_UPPER, LIPS_OUTER_LOWER, LIPS_OUTER_UPPER } from './landmarks';
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
  /** MD Codes site that drives this operator in mode B (docs/TASKS.md M5b); none for the masseter (toxin). */
  site?: MdSite;
  /** Only in one mode: 'area' = the concern slider of mode A, 'sites' = MD Codes mode. Absent = both. */
  use?: 'area' | 'sites';
  /** Bridge between two filled sites (mode B): its strength is the weaker of the two. */
  bridge?: readonly [MdSite, MdSite];
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

function lipOperator(concernId: ConcernId, cols: Omit<LipSample, 'd'>[], outward: 1 | -1, gain: number): Operator {
  const samples = cols.map((s) => ({ ...s, d: Math.min(MAX_SHIFT, gain * Math.abs(s.border - s.mouth)) }));
  const xs = samples.map((s) => s.x);
  const band = (s: LipSample) => Math.max(LIP.minBand, LIP.band * Math.abs(s.border - s.mouth));
  const top = Math.min(...samples.map((s) => s.border - band(s)));
  const bottom = Math.max(...samples.map((s) => s.border + band(s)));
  const c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (top + bottom) / 2 };
  return { concernId, side: 'M', kind: 'lip', c, rx: (Math.max(...xs) - Math.min(...xs)) / 2 + 0.005, ry: (bottom - top) / 2, samples, outward };
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

  // 8 — lips, the way a lip designer works: the vermilion border moves outward everywhere along the lip, by a share
  // of the lip's own thickness at that point. The shape is kept (Cupid's bow, the fine corners), the corners grow
  // only as much as they are thick, and there is no bulge in the middle. The first version inflated each lip around
  // its centre: thin at the corners, suddenly full in the middle (owner review 2026-11-15). The upper lip gets a
  // larger share when it is thinner than the common aesthetic ratio upper : lower ≈ 1 : 1.6, and the reverse.
  if (region('lip-volume', 'M')) {
    const lips = lipShape(F);
    const ratio = lips.upperMid / Math.max(1e-6, lips.lowerMid);
    const balance = Math.min(LIP.balanceMax, Math.max(1 / LIP.balanceMax, Math.sqrt(LIP.idealRatio / ratio)));
    ops.push(lipOperator('lip-volume', lips.upper, -1, LIP.gain * balance));
    ops.push(lipOperator('lip-volume', lips.lower, 1, LIP.gain / balance));
  }

  // 10 — chin: the whole lower border moves down evenly (a wide vector, so the chin does not become pointed) and
  // the chin widens a little; for a man less length and more width, which keeps it square.
  const chinRegion = region('chin', 'M');
  if (chinRegion) {
    const { c, hx, hy } = extent(chinRegion.outline);
    ops.push(vector('chin', 'M', { x: c.x, y: c.y + hy * 0.3 }, hx * 2.2, hy * 1.3, { x: 0, y: 1 }, male ? 0.02 : 0.03));
    ops.push(inflate('chin', 'M', c, hx * (male ? 1.8 : 1.4), hy * 1.2, male ? 0.03 : 0.018, { x: 1, y: 0.25 }));
  }

  for (const side of ['R', 'L'] as const) {
    const s = side === 'R' ? -1 : 1;
    const cheek = region('midface-volume', side);
    const contour = contourAt(side);
    if (cheek) {
      const { c, hx, hy } = extent(cheek.outline);
      // Mode A: the whole cheek at once.
      ops.push({ ...inflate('midface-volume', side, c, hx * 1.4, hy * 1.4, 0.03), use: 'area' });
      ops.push({ ...vector('midface-volume', side, c, hx * 1.6, hy * 1.6, { x: s * 0.3, y: -1 }, 0.035), use: 'area' });
      ops.push(...cheekSites(side, c, contour));
    }
    const fold = region('nasolabial-fold', side);
    if (fold) {
      const { c, hx, hy } = extent(fold.outline);
      ops.push(vector('nasolabial-fold', side, { x: c.x + s * hx * 0.6, y: c.y - hy * 0.2 }, Math.max(0.14, hx * 1.6), Math.max(0.16, hy * 1.1), { x: s * 0.35, y: -1 }, 0.03));
    }
    if (region('marionette', side)) {
      const corner = F(side === 'R' ? ANCHOR.rMouth : ANCHOR.lMouth);
      ops.push(vector('marionette', side, { x: corner.x + s * 0.03, y: corner.y + 0.04 }, 0.12, 0.14, { x: 0, y: -1 }, 0.03));
    }
    // Jaw operators sit on the face outline itself. The jowl and masseter regions are placed geometrically and
    // land near the mouth corners on close-up photos (M1 open point), so operators built from them pushed the
    // middle of the lower cheek and left a dent (owner review 2 2026-11-15).
    if (contour && region('jawline', side)) {
      // Jowl: the soft tissue just inside the jaw line is lifted; the outline itself hardly moves, so no notch.
      const j = contour(mouth.y + (chin.y - mouth.y) * 0.55);
      ops.push(vector('jawline', side, { x: j.x - s * 0.12, y: j.y }, 0.14, 0.18, { x: 0, y: -1 }, 0.025));
      // Jaw angle a little fuller outward, so the line from the angle to the chin reads defined.
      const a = contour(mouth.y);
      ops.push(vector('jawline', side, { x: a.x - s * 0.03, y: a.y }, 0.12, 0.2, { x: s, y: 0.4 }, male ? 0.025 : 0.015));
    }
    if (contour && region('masseter', side)) {
      // Masseter: the outline at the level of the muscle moves in over a tall ellipse, so the side of the face
      // narrows evenly instead of getting a dent.
      const m = contour(mouth.y - 0.08);
      ops.push(vector('masseter', side, { x: m.x - s * 0.06, y: m.y }, 0.14, 0.3, { x: -s, y: 0 }, 0.025));
    }
    const temple = region('temple', side);
    if (temple) {
      const { c, hx, hy } = extent(temple.outline);
      ops.push(inflate('temple', side, c, hx * 1.3, hy * 1.3, 0.03, { x: 1, y: 0.5 }));
    }
    const brow = region('brow', side);
    if (brow && brow.shape.type === 'polygon') {
      // The brow polygon starts at the tail of its upper edge.
      const { hx, hy } = extent(brow.outline);
      const tail = brow.shape.pts[0]!;
      ops.push(vector('brow', side, { x: tail.x - s * hx * 0.25, y: tail.y + hy * 0.3 }, hx * 0.9, Math.max(0.12, hy * 2.2), { x: 0, y: -1 }, 0.035));
    }
  }
  const tagged = ops.map((op) => (op.site || op.use ? op : SITE_OF[op.concernId] ? { ...op, site: SITE_OF[op.concernId] } : op));
  return [...tagged, ...bridges(tagged)];
}

/** MD Codes site of each concern's operators (docs/TASKS.md M5b). The cheek is split into Ck1–Ck3 below. */
const SITE_OF: Partial<Record<ConcernId, MdSite>> = {
  temple: 'T',
  brow: 'E',
  'nasolabial-fold': 'NL',
  'lip-volume': 'Lp',
  marionette: 'M',
  chin: 'C',
  jawline: 'Jw',
};

/**
 * Cheek of mode B, three sites (engine and aesthetic-design values, not clinical ones; placed by eye on the test
 * photos, 2026-11-16). `c` is the centre of the cheek region.
 *   Ck1 zygomatic arch: lateral, near the face outline, projects mostly sideways (wider upper face).
 *   Ck2 zygomatic eminence: the cheek apex, a little up and out from the centre; fills and lifts up and out.
 *   Ck3 anteromedial cheek: medial, below the under-eye strip; fills and supports upward.
 * Each one is smaller than the mode-A cheek, so all three at the same strength come close to mode A.
 */
const CHEEK_SITES = {
  ck1: { up: 0.09, inFromEdge: 0.07, rx: 0.12, ry: 0.1, shift: 0.018, gainY: 0.4 },
  ck2: { out: 0.03, up: 0.04, rx: 0.16, ry: 0.14, shift: 0.02, liftR: 0.2, lift: 0.018 },
  ck3: { in: 0.13, up: 0.01, rx: 0.12, ry: 0.12, shift: 0.018, liftR: 0.15, lift: 0.012 },
} as const;

function cheekSites(side: 'R' | 'L', c: Pt, contour: ((y: number) => Pt) | null): Operator[] {
  const s = side === 'R' ? -1 : 1;
  const k1 = CHEEK_SITES.ck1;
  const k2 = CHEEK_SITES.ck2;
  const k3 = CHEEK_SITES.ck3;
  const tag = (op: Operator, site: MdSite): Operator => ({ ...op, site, use: 'sites' });
  const edge = contour ? contour(c.y - k1.up).x : c.x + s * 0.25;
  const c1 = { x: edge - s * k1.inFromEdge, y: c.y - k1.up };
  const c2 = { x: c.x + s * k2.out, y: c.y - k2.up };
  const c3 = { x: c.x - s * k3.in, y: c.y - k3.up };
  return [
    tag(inflate('midface-volume', side, c1, k1.rx, k1.ry, k1.shift, { x: 1, y: k1.gainY }), 'Ck1'),
    tag(inflate('midface-volume', side, c2, k2.rx, k2.ry, k2.shift), 'Ck2'),
    tag(vector('midface-volume', side, c2, k2.liftR, k2.liftR * 0.9, { x: s * 0.3, y: -1 }, k2.lift), 'Ck2'),
    tag(inflate('midface-volume', side, c3, k3.rx, k3.ry, k3.shift), 'Ck3'),
    tag(vector('midface-volume', side, c3, k3.liftR, k3.liftR, { x: 0, y: -1 }, k3.lift), 'Ck3'),
  ];
}

/**
 * Neighbouring sites that blend into one fill when both get volume (owner rule 2026-11-16, PRD F4.12). Each
 * inflate pushes its rim outward, so two filled sites squeeze the skin between them and the result reads as two
 * bumps with a groove. A bridge is an inflate over the gap; it runs at the weaker of the two strengths, so it
 * is off as soon as one of them is 0.
 */
export const BRIDGES: readonly (readonly [MdSite, MdSite])[] = [
  ['T', 'Ck1'],
  ['Ck1', 'Ck2'],
  ['Ck2', 'Ck3'],
  ['Ck3', 'NL'],
  ['M', 'C'],
  ['C', 'Jw'],
];
/**
 * Bridge settings (engine values): margin around the segment between the two centres (× the smaller site
 * radius), the largest shift and the number of steps tried up to it. Each bridge gets the smallest shift that
 * leaves the skin between the two sites unsqueezed (det ≤ 1 on the inner part of the segment, `inner`), measured
 * on this face; sites that already overlap into one fill get none.
 */
const BRIDGE = { margin: 0.8, maxShift: 0.022, steps: 11, inner: 0.15 } as const;

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
  const ofSite = (site: MdSite, side: 'R' | 'L') => ops.filter((o) => o.site === site && o.use !== 'area' && (o.side === side || o.side === 'M'));
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
        if (squeezeBetween([...both, candidate], a.c, b.c) <= 1) {
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
  const h = Math.max(LIP.minBand, LIP.band * thick);
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
