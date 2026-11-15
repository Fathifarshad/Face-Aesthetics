import type { ConcernId } from '../data/types';
import { ANCHOR } from './landmarks';
import { toFace } from './faceFrame';
import type { RegionSet, Side } from './regions';
import { centroid, lerp } from './shapes';
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

export interface Operator {
  concernId: ConcernId;
  side: Side;
  kind: 'inflate' | 'vector';
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
  const F = (i: number) => toFace(set.frame, lm[i]!);
  const ops: Operator[] = [];
  const region = (id: ConcernId, side: Side) => set.regions.find((r) => r.concernId === id && r.side === side);

  // 8 — lips: one operator per lip, centred halfway between the mouth line and the lip's outer edge.
  if (region('lip-volume', 'M')) {
    const rMouth = F(ANCHOR.rMouth);
    const lMouth = F(ANCHOR.lMouth);
    const mid = lerp(rMouth, lMouth, 0.5);
    const halfMouth = Math.abs(lMouth.x - rMouth.x) / 2;
    const top = F(ANCHOR.upperLipTop);
    const bottom = F(ANCHOR.lowerLipBottom);
    for (const edge of [top, bottom]) {
      const thick = Math.max(0.02, Math.abs(edge.y - mid.y));
      ops.push(inflate('lip-volume', 'M', lerp(mid, edge, 0.5), halfMouth * 1.15, thick * 1.8, 0.035, { x: 0.25, y: 1 }));
    }
  }

  // 10 — chin: the whole lower border moves down evenly (a wide vector, so the chin does not become pointed) and
  // the chin widens a little; for a man less length and more width, which keeps it square.
  const chin = region('chin', 'M');
  if (chin) {
    const { c, hx, hy } = extent(chin.outline);
    ops.push(vector('chin', 'M', { x: c.x, y: c.y + hy * 0.3 }, hx * 2.2, hy * 1.3, { x: 0, y: 1 }, male ? 0.02 : 0.03));
    ops.push(inflate('chin', 'M', c, hx * (male ? 1.8 : 1.4), hy * 1.2, male ? 0.03 : 0.018, { x: 1, y: 0.25 }));
  }

  for (const side of ['R', 'L'] as const) {
    const s = side === 'R' ? -1 : 1;
    const cheek = region('midface-volume', side);
    if (cheek) {
      const { c, hx, hy } = extent(cheek.outline);
      ops.push(inflate('midface-volume', side, c, hx * 1.4, hy * 1.4, 0.03));
      ops.push(vector('midface-volume', side, c, hx * 1.6, hy * 1.6, { x: s * 0.3, y: -1 }, 0.035));
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
    const jowl = region('jawline', side);
    const masseter = region('masseter', side);
    if (jowl) {
      // The jowl is lifted straight up; pulling it inward as well made the jaw line concave.
      const { c, hx, hy } = extent(jowl.outline);
      ops.push(vector('jawline', side, c, hx * 1.4, hy * 1.6, { x: 0, y: -1 }, 0.03));
      if (masseter) {
        // Jaw angle a little fuller outward, so the line from the angle to the chin reads straight and defined.
        const m = extent(masseter.outline);
        ops.push(vector('jawline', side, { x: m.c.x + s * m.hx * 0.5, y: m.c.y + m.hy * 0.8 }, m.hx * 0.9, m.hy * 0.7, { x: s, y: 0.3 }, male ? 0.03 : 0.02));
      }
    }
    if (masseter) {
      // Only the lateral contour moves in; a wide operator dragged the inner cheek along and hollowed the lower face.
      const { c, hx, hy } = extent(masseter.outline);
      ops.push(vector('masseter', side, { x: c.x + s * hx * 0.6, y: c.y }, hx * 1.1, hy * 1.5, { x: -s, y: 0 }, 0.03));
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
  return ops;
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
