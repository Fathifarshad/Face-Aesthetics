import type { Pt } from './types';

/** Region geometry in face coordinates (see faceFrame.ts). */
export type Shape =
  | { type: 'polygon'; pts: Pt[] }
  | { type: 'ellipse'; c: Pt; rx: number; ry: number }
  | { type: 'band'; path: Pt[]; halfWidth: number };

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

/** Closed outline of a strip of constant half-width around a polyline (flat ends). */
export function bandOutline(path: readonly Pt[], halfWidth: number): Pt[] {
  const left: Pt[] = [];
  const right: Pt[] = [];
  path.forEach((p, i) => {
    const a = path[Math.max(0, i - 1)]!;
    const b = path[Math.min(path.length - 1, i + 1)]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = (-(b.y - a.y) / len) * halfWidth;
    const ny = ((b.x - a.x) / len) * halfWidth;
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
  return bandOutline(shape.path, shape.halfWidth);
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
