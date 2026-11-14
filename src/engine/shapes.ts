import type { Pt } from './types';

/** Region geometry in face coordinates (see faceFrame.ts). */
export type Shape =
  | { type: 'polygon'; pts: Pt[] }
  | { type: 'ellipse'; c: Pt; rx: number; ry: number }
  | { type: 'band'; path: Pt[]; halfWidth: number; /** Width factor at the start of the path; grows to 1 over the first third. */ startScale?: number };

export const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const offset = (p: Pt, dx: number, dy: number): Pt => ({ x: p.x + dx, y: p.y + dy });

/** Signed shoelace area; the sign depends on winding. */
function signedArea(pts: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export const area = (pts: readonly Pt[]): number => Math.abs(signedArea(pts));

/** Area-weighted centroid of a simple polygon (falls back to the vertex mean for degenerate input). */
export function centroid(pts: readonly Pt[]): Pt {
  const a = signedArea(pts);
  if (Math.abs(a) < 1e-12) {
    return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    const w = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * w;
    cy += (p.y + q.y) * w;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/** Scales a polygon about its centroid: k = 0.92 shrinks by 8 %, k = 1.3 grows by 30 %. */
export function scaleAboutCentroid(pts: readonly Pt[], k: number): Pt[] {
  const c = centroid(pts);
  return pts.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }));
}

export function quadBezier(a: Pt, ctrl: Pt, b: Pt, segments = 12): Pt[] {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments;
    const u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * ctrl.x + t * t * b.x, y: u * u * a.y + 2 * u * t * ctrl.y + t * t * b.y };
  });
}

/** Smooth curve that passes through every given point (uniform Catmull-Rom). */
export function smoothPath(pts: readonly Pt[], perSegment = 6): Pt[] {
  if (pts.length < 3) return [...pts];
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    for (let k = 0; k < perSegment; k++) {
      const t = k / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const blend = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: blend(p0.x, p1.x, p2.x, p3.x), y: blend(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

/** Fraction of the path over which a tapered band reaches its full width. */
const TAPER_LENGTH = 0.35;

/** Closed outline of a strip around a polyline (flat ends). `startScale` < 1 makes the strip narrower at its start. */
export function bandOutline(path: readonly Pt[], halfWidth: number, startScale = 1): Pt[] {
  const left: Pt[] = [];
  const right: Pt[] = [];
  path.forEach((p, i) => {
    const a = path[Math.max(0, i - 1)]!;
    const b = path[Math.min(path.length - 1, i + 1)]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const along = path.length > 1 ? i / (path.length - 1) : 1;
    const hw = halfWidth * (startScale + (1 - startScale) * Math.min(1, along / TAPER_LENGTH));
    const nx = (-(b.y - a.y) / len) * hw;
    const ny = ((b.x - a.x) / len) * hw;
    left.push({ x: p.x + nx, y: p.y + ny });
    right.push({ x: p.x - nx, y: p.y - ny });
  });
  return [...left, ...right.reverse()];
}

export function ellipseOutline(c: Pt, rx: number, ry: number, segments = 40): Pt[] {
  return Array.from({ length: segments }, (_, i) => {
    const t = (i / segments) * Math.PI * 2;
    return { x: c.x + rx * Math.cos(t), y: c.y + ry * Math.sin(t) };
  });
}

export function outlineOf(shape: Shape): Pt[] {
  if (shape.type === 'polygon') return shape.pts;
  if (shape.type === 'ellipse') return ellipseOutline(shape.c, shape.rx, shape.ry);
  return bandOutline(shape.path, shape.halfWidth, shape.startScale);
}

export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** y values where the closed polygon crosses the vertical line at x. */
export function crossingsAtX(poly: readonly Pt[], x: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    if (a.x > x !== b.x > x) out.push(a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y));
  }
  return out;
}

/** x values where the closed polygon crosses the horizontal line at y. */
export function crossingsAtY(poly: readonly Pt[], y: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    if (a.y > y !== b.y > y) out.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
  }
  return out;
}
