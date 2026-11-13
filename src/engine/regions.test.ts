import { describe, expect, it } from 'vitest';
import { CONCERN_IDS } from '../data/types';
import { buildFrame, rollDeg, toFace, toPx } from './faceFrame';
import { FIXTURE, syntheticMesh, transformed } from './fixtures';
import { ANCHOR, FACE_OVAL, L_EYE_LOWER, LIPS_OUTER_LOWER, LIPS_OUTER_UPPER, R_BROW_UPPER, R_EYE_LOWER, R_EYE_UPPER } from './landmarks';
import { buildRegions, outlinePx, type Region, type RegionSet } from './regions';
import { area, centroid, pointInPolygon } from './shapes';
import type { Pt } from './types';

const size = { width: FIXTURE.width, height: FIXTURE.height };
const mesh = syntheticMesh();
const base = buildRegions(mesh, size);
const get = (set: RegionSet, id: string): Region => {
  const r = set.regions.find((x) => x.id === id);
  if (!r) throw new Error(`region ${id} missing`);
  return r;
};
const close = (a: Pt, b: Pt, digits = 6) => {
  expect(a.x).toBeCloseTo(b.x, digits);
  expect(a.y).toBeCloseTo(b.y, digits);
};

describe('face frame', () => {
  it('puts the origin between the outer eye corners and measures the unit between them', () => {
    const f = buildFrame(mesh);
    close(f.origin, FIXTURE.origin);
    expect(f.unit).toBeCloseTo(FIXTURE.unit, 9);
    close(toFace(f, mesh[ANCHOR.rEyeOuter]!), { x: -0.5, y: 0 });
    close(toFace(f, mesh[ANCHOR.lEyeOuter]!), { x: 0.5, y: 0 });
    expect(toFace(f, mesh[ANCHOR.chin]!).y).toBeGreaterThan(1);
    expect(rollDeg(f)).toBeCloseTo(0, 9);
  });

  it('round-trips pixel ↔ face coordinates', () => {
    const f = buildFrame(transformed(mesh, { deg: 17, scale: 1.4, dx: 30, dy: -12 }));
    for (const q of [{ x: 0, y: 0 }, { x: -0.4, y: 0.9 }, { x: 0.61, y: -0.3 }]) close(toFace(f, toPx(f, q)), q, 9);
  });

  it('keeps y pointing to the chin and the subject’s right on negative x in a mirrored photo', () => {
    const f = buildFrame(transformed(mesh, { mirror: true }));
    const m = transformed(mesh, { mirror: true });
    expect(toFace(f, m[ANCHOR.chin]!).y).toBeGreaterThan(1);
    expect(toFace(f, m[ANCHOR.rEyeOuter]!).x).toBeCloseTo(-0.5, 9);
  });

  it('rejects a mesh without the expected points or with coincident eye corners', () => {
    expect(() => buildFrame(mesh.slice(0, 68))).toThrow(/478-point/);
    expect(() => buildFrame(mesh.map(() => ({ x: 1, y: 1 })))).toThrow(/coincide/);
  });
});

describe('regions', () => {
  it('places all 16 concerns of the PRD table, in order, with left and right where they are paired', () => {
    expect(base.missing).toEqual([]);
    expect([...new Set(base.regions.filter((r) => r.concernId).map((r) => r.concernId))]).toEqual([...CONCERN_IDS]);
    const paired = ['crows-feet', 'tear-trough', 'midface-volume', 'nasolabial-fold', 'marionette', 'jawline', 'masseter', 'temple', 'brow'];
    for (const id of CONCERN_IDS) {
      const sides = base.regions.filter((r) => r.concernId === id).map((r) => r.side);
      expect(sides, id).toEqual(paired.includes(id) ? ['R', 'L'] : ['M']);
    }
  });

  it('adds the protected regions: eyes, nostrils, brows and lips', () => {
    const ids = base.regions.filter((r) => r.protect).map((r) => r.id);
    expect(ids.sort()).toEqual(
      ['brow:L', 'brow:R', 'lip-volume:M', 'protect-eye:L', 'protect-eye:R', 'protect-nostril:L', 'protect-nostril:R'].sort(),
    );
  });

  it('gives the same face-coordinate geometry however the photo is rotated, scaled or shifted', () => {
    const other = buildRegions(transformed(mesh, { deg: -23, scale: 0.6, dx: 80, dy: 40 }), { width: 2000, height: 2000 });
    expect(other.regions.map((r) => r.id)).toEqual(base.regions.map((r) => r.id));
    for (const r of base.regions) {
      const o = get(other, r.id);
      expect(o.outline.length, r.id).toBe(r.outline.length);
      r.outline.forEach((p, i) => close(o.outline[i]!, p));
    }
  });

  it('is left/right symmetric on a symmetric face', () => {
    for (const r of base.regions.filter((x) => x.side === 'R')) {
      const l = get(base, r.id.replace(':R', ':L'));
      const cr = centroid(r.outline);
      const cl = centroid(l.outline);
      close({ x: -cr.x, y: cr.y }, cl);
      expect(area(l.outline)).toBeCloseTo(area(r.outline), 6);
      expect(cr.x, r.id).toBeLessThan(0);
    }
    for (const r of base.regions.filter((x) => x.side === 'M')) expect(centroid(r.outline).x).toBeCloseTo(0, 6);
  });

  it('keeps the under-eye strip below the lower lid and above the cheek centre', () => {
    const F = (i: number) => toFace(base.frame, mesh[i]!);
    for (const [side, lid] of [['R', R_EYE_LOWER], ['L', L_EYE_LOWER]] as const) {
      const strip = get(base, `tear-trough:${side}`).outline;
      const lowestLid = Math.max(...lid.map((i) => F(i).y));
      expect(Math.min(...strip.map((p) => p.y))).toBeGreaterThan(Math.min(...lid.map((i) => F(i).y)));
      expect(centroid(strip).y).toBeGreaterThan(lowestLid);
      expect(Math.max(...strip.map((p) => p.y))).toBeLessThan(centroid(get(base, `midface-volume:${side}`).outline).y + 0.1);
    }
  });

  it('keeps the nasolabial strip off the lips and running from beside the nose to below the mouth corner', () => {
    const lips = get(base, 'lip-volume:M').outline;
    for (const side of ['R', 'L'] as const) {
      const band = get(base, `nasolabial-fold:${side}`);
      expect(band.outline.some((p) => pointInPolygon(p, lips))).toBe(false);
      expect(lips.some((p) => pointInPolygon(p, band.outline))).toBe(false);
      if (band.shape.type !== 'band') throw new Error('expected a band');
      const path = band.shape.path;
      const mouth = toFace(base.frame, mesh[side === 'R' ? ANCHOR.rMouth : ANCHOR.lMouth]!);
      const alar = base.derived[`alar${side}`]!;
      expect(Math.abs(path[0]!.x)).toBeGreaterThan(Math.abs(alar.x));
      expect(path[0]!.y).toBeLessThan(toFace(base.frame, mesh[ANCHOR.subnasale]!).y);
      expect(path.at(-1)!.y).toBeGreaterThan(mouth.y);
      expect(Math.abs(path.at(-1)!.x)).toBeGreaterThan(Math.abs(mouth.x));
      expect(band.shape.halfWidth).toBe(0.055);
    }
  });

  it('places the forehead above the brows and inside the face outline', () => {
    const F = (i: number) => toFace(base.frame, mesh[i]!);
    const forehead = get(base, 'forehead-lines:M').outline;
    const browTop = Math.min(...R_BROW_UPPER.map((i) => F(i).y));
    expect(centroid(forehead).y).toBeLessThan(browTop);
    expect(Math.min(...forehead.map((p) => p.y))).toBeGreaterThan(F(ANCHOR.foreheadTop).y);
  });

  it('keeps every region centre inside the face outline, lateral regions lateral and lower regions low', () => {
    const oval = FACE_OVAL.map((i) => toFace(base.frame, mesh[i]!));
    for (const r of base.regions.filter((x) => x.concernId !== 'neck')) expect(pointInPolygon(centroid(r.outline), oval), r.id).toBe(true);
    const c = (id: string) => centroid(get(base, id).outline);
    const eyeOuterX = 0.5;
    expect(Math.abs(c('crows-feet:L').x)).toBeGreaterThan(eyeOuterX);
    expect(Math.abs(c('temple:L').x)).toBeGreaterThan(eyeOuterX);
    expect(c('temple:L').y).toBeLessThan(0);
    expect(c('marionette:L').y).toBeGreaterThan(c('nasolabial-fold:L').y);
    expect(c('jawline:L').y).toBeGreaterThan(c('marionette:L').y);
    expect(c('chin:M').y).toBeGreaterThan(c('lip-volume:M').y);
    expect(c('masseter:L').x).toBeGreaterThan(c('jawline:L').x);
    expect(c('glabellar-lines:M').y).toBeLessThan(0);
  });

  it('covers the eye and lip contours with their protected regions', () => {
    const F = (i: number) => toFace(base.frame, mesh[i]!);
    const eye = get(base, 'protect-eye:R').outline;
    for (const i of [...R_EYE_UPPER, ...R_EYE_LOWER].slice(1, -1)) expect(pointInPolygon(F(i), eye), `eye point ${i}`).toBe(true);
    const lips = get(base, 'lip-volume:M').outline;
    const perioral = get(base, 'perioral-lines:M').outline;
    expect(pointInPolygon(centroid(lips), perioral)).toBe(true);
    expect(area(perioral)).toBeGreaterThan(area(lips));
    for (const i of [...LIPS_OUTER_UPPER, ...LIPS_OUTER_LOWER].slice(1, 10)) expect(pointInPolygon(F(i), perioral), `lip point ${i}`).toBe(true);
    expect(Math.min(...perioral.map((p) => p.y))).toBeGreaterThan(F(ANCHOR.subnasale).y);
  });

  it('reports the neck as missing when the photo ends at the chin or the image size is unknown', () => {
    const chinY = mesh[ANCHOR.chin]!.y;
    const tight = buildRegions(mesh, { width: 1000, height: Math.round(chinY + 10) });
    expect(tight.missing).toEqual(['neck']);
    expect(tight.regions.some((r) => r.concernId === 'neck')).toBe(false);
    expect(buildRegions(mesh).missing).toEqual(['neck']);
    const neck = get(base, 'neck:M').outline;
    expect(Math.min(...neck.map((p) => p.y))).toBeGreaterThan(toFace(base.frame, mesh[ANCHOR.lowerLipBottom]!).y);
    expect(Math.max(...outlinePx(base, get(base, 'neck:M')).map((p) => p.y))).toBeLessThanOrEqual(size.height);
  });

  it('converts outlines to pixels inside the image for the synthetic face', () => {
    for (const r of base.regions) {
      for (const p of outlinePx(base, r)) {
        expect(p.x, r.id).toBeGreaterThanOrEqual(0);
        expect(p.x, r.id).toBeLessThanOrEqual(size.width);
        expect(p.y, r.id).toBeGreaterThanOrEqual(0);
        expect(p.y, r.id).toBeLessThanOrEqual(size.height);
      }
    }
  });
});
