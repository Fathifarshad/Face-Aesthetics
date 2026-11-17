import type { Point } from './types';

export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

export const radToDeg = (r: number): number => (r * 180) / Math.PI;

/** Rotate p around center by angle (degrees, positive = counter-clockwise in image coordinates with y down). */
export function rotate(p: Point, center: Point, angleDeg: number): Point {
  const a = (angleDeg * Math.PI) / 180;
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * Math.cos(a) - dy * Math.sin(a),
    y: center.y + dx * Math.sin(a) + dy * Math.cos(a),
    z: p.z,
  };
}

/** Angle of the vector a→b against the image horizontal, degrees (y down, so positive = b lower than a). */
export const lineAngleDeg = (a: Point, b: Point): number => radToDeg(Math.atan2(b.y - a.y, b.x - a.x));

/**
 * Least-squares fit of x = slope·y + intercept (suited to near-vertical lines such as the facial midline).
 */
export function fitVerticalLine(points: readonly Point[]): { slope: number; intercept: number } {
  const ys = points.map((p) => p.y);
  const xs = points.map((p) => p.x);
  const my = mean(ys);
  const mx = mean(xs);
  let num = 0;
  let den = 0;
  for (let i = 0; i < points.length; i++) {
    num += (ys[i]! - my) * (xs[i]! - mx);
    den += (ys[i]! - my) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: mx - slope * my };
}

/** Perpendicular distance from p to the line x = slope·y + intercept. */
export function distToVerticalLine(p: Point, line: { slope: number; intercept: number }): number {
  return Math.abs(p.x - line.slope * p.y - line.intercept) / Math.hypot(1, line.slope);
}

export const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export function pointInPolygon(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
