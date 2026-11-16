import type { MdCode } from '../data/mdCodes';
import type { ConcernId } from '../data/types';
import type { Pt } from './types';

/**
 * MD Codes that smooth instead of reshaping (docs/TASKS.md M5c, owner decision 2026-11-16): each one smooths its
 * own part of a concern region, with the concern's smoothing type. The region is split along one face axis into
 * parts that add up to the whole region, with soft seams, so all codes of a region at the same strength smooth
 * about as the concern does (engine geometry, not clinical values):
 *   axis 'x' on a side region: 0 = medial edge, 1 = lateral edge; on a midline region: 0 = subject's right edge,
 *   1 = left edge (a two-sided code's left part is the mirror of its right part).
 *   axis 'y': 0 = top, 1 = bottom.
 */
export interface CodeSmoothing {
  concernId: ConcernId;
  axis: 'x' | 'y';
  /** Part of the region along the axis (for a two-sided code on a midline region: its right side). */
  from: number;
  to: number;
}

const third = (concernId: ConcernId, axis: 'x' | 'y', i: number): CodeSmoothing => ({ concernId, axis, from: i / 3, to: (i + 1) / 3 });

export const CODE_SMOOTHING: Partial<Record<MdCode, CodeSmoothing>> = {
  // Forehead: lateral, medial and central fifths (F2 · F1 · F3 · F1 · F2).
  F2: { concernId: 'forehead-lines', axis: 'x', from: 0, to: 0.2 },
  F1: { concernId: 'forehead-lines', axis: 'x', from: 0.2, to: 0.4 },
  F3: { concernId: 'forehead-lines', axis: 'x', from: 0.4, to: 0.6 },
  // Glabella: G1 · G2 · G1.
  G1: { concernId: 'glabellar-lines', axis: 'x', from: 0, to: 0.3 },
  G2: { concernId: 'glabellar-lines', axis: 'x', from: 0.3, to: 0.7 },
  // Lateral orbital area: upper, central and lower thirds.
  O3: third('crows-feet', 'y', 0),
  O1: third('crows-feet', 'y', 1),
  O2: third('crows-feet', 'y', 2),
  // Under the eye: medial, central and lateral thirds (the under-eye shadow lift, owner 2026-11-16).
  Tt3: third('tear-trough', 'x', 0),
  Tt1: third('tear-trough', 'x', 1),
  Tt2: third('tear-trough', 'x', 2),
  Lp8: { concernId: 'perioral-lines', axis: 'x', from: 0, to: 1 },
};

/** Half-width of the soft seam between two parts, as a share of the region's extent along the axis. */
const SEAM = 0.06;

/** Share of a point at position t (0…1 along the axis) that belongs to the part [from, to]; parts add up to 1. */
export function partWeight(t: number, from: number, to: number): number {
  const up = from <= 0 ? 1 : Math.min(1, Math.max(0, (t - (from - SEAM)) / (2 * SEAM)));
  const down = to >= 1 ? 1 : Math.min(1, Math.max(0, ((to + SEAM) - t) / (2 * SEAM)));
  return Math.min(up, down);
}

/**
 * Position along the axis as a linear function of a face point, for one region: `side` 'R' or 'L' on a side
 * region measures from the medial edge; 'M' (a midline region) from the subject's right edge.
 */
export function axisOf(outline: readonly Pt[], axis: 'x' | 'y', regionSide: 'R' | 'L' | 'M'): (p: Pt) => number {
  const raw = (p: Pt) => (axis === 'y' ? p.y : regionSide === 'R' ? -p.x : p.x);
  const vs = outline.map(raw);
  const lo = Math.min(...vs);
  const span = Math.max(1e-6, Math.max(...vs) - lo);
  return (p: Pt) => (raw(p) - lo) / span;
}

/** The part of a polygon where lo ≤ f(p) ≤ hi, for a linear f (Sutherland–Hodgman, two half-planes). */
export function clipToBand(poly: readonly Pt[], f: (p: Pt) => number, lo: number, hi: number): Pt[] {
  const clip = (pts: readonly Pt[], keep: (v: number) => boolean, edge: number): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const fa = f(a);
      const fb = f(b);
      if (keep(fa)) out.push(a);
      if (keep(fa) !== keep(fb)) {
        const t = (edge - fa) / (fb - fa);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    return out;
  };
  return clip(clip(poly, (v) => v >= lo, lo), (v) => v <= hi, hi);
}
