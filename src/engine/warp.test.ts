import { describe, expect, it } from 'vitest';
import type { ConcernId } from '../data/types';
import { buildFrame, toPx } from './faceFrame';
import { FIXTURE, syntheticMesh, syntheticPicture } from './fixtures';
import { MD_SITES, type MdSite } from '../data/mdCodes';
import { MAX_INTENSITY, operatorStrength, prepare, render } from './pipeline';
import { buildRegions } from './regions';
import { addOperator, applyField, BRIDGES, buildOperators, MAX_SHIFT, newField, type Field, type PlacedOperator } from './warp';

const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && a.every((v, i) => v === b[i]);

describe('warp operators on the synthetic face', () => {
  const mesh = syntheticMesh();
  const frame = buildFrame(mesh);
  const pic = syntheticPicture(-1.0);
  // Texture so that any displacement shows up in the pixels.
  for (let y = 0; y < pic.height; y++)
    for (let x = 0; x < pic.width; x++) {
      const i = (y * pic.width + x) * 4;
      const v = ((x >> 3) + (y >> 3)) % 2 ? 40 : 0;
      pic.data[i] = Math.max(0, pic.data[i]! - v);
    }
  const prepared = prepare({ ...pic, landmarks: mesh });
  const { rect, ops } = prepared;
  const unit = FIXTURE.unit;
  const W_CONCERNS: ConcernId[] = ['midface-volume', 'nasolabial-fold', 'marionette', 'lip-volume', 'chin', 'jawline', 'masseter', 'temple', 'brow'];

  /** Field of the given operators, each at the given strength. */
  const fieldOf = (list: readonly PlacedOperator[], strength = 1): Field => {
    const f = newField(rect.width, rect.height);
    for (const p of list) addOperator(f, p, strength);
    return f;
  };
  const shiftAt = (f: Field, i: number) => Math.hypot(f.dx[i]!, f.dy[i]!);
  /**
   * det(I − ∇d) at a pixel: the area of the source the pixel shows, per pixel. Below 1 the skin is enlarged
   * (filled), above 1 it is squeezed (a groove); at 0 or less the picture folds.
   */
  const detAt = (f: Field, i: number) => {
    const w = rect.width;
    const dxx = (f.dx[i + 1]! - f.dx[i - 1]!) / 2;
    const dxy = (f.dx[i + w]! - f.dx[i - w]!) / 2;
    const dyx = (f.dy[i + 1]! - f.dy[i - 1]!) / 2;
    const dyy = (f.dy[i + w]! - f.dy[i - w]!) / 2;
    return (1 - dxx) * (1 - dyy) - dxy * dyx;
  };
  /** Field value at a point given in face coordinates. */
  const at = (f: Field, q: { x: number; y: number }) => {
    const p = toPx(frame, q);
    const i = (Math.round(p.y) - rect.y) * rect.width + Math.round(p.x) - rect.x;
    return { dx: f.dx[i]!, dy: f.dy[i]! };
  };
  const opsOf = (id: ConcernId, side?: 'R' | 'L' | 'M') => ops.filter((o) => o.op.concernId === id && (!side || o.op.side === side));

  it('has operators for every concern whose effect includes W (PRD §6), on both sides where there are two', () => {
    for (const id of W_CONCERNS) expect(opsOf(id).length, id).toBeGreaterThan(0);
    for (const id of ['midface-volume', 'masseter', 'jawline', 'brow', 'temple', 'marionette'] as const) {
      expect(opsOf(id, 'R').length, id).toBe(opsOf(id, 'L').length);
    }
    expect(new Set(ops.map((o) => o.op.concernId))).toEqual(new Set(W_CONCERNS));
  });

  it('returns the input exactly at zero strength', () => {
    const base = render(prepared, []);
    const zero = render(prepared, W_CONCERNS.map((concernId) => ({ concernId, intensity: 0 })), { warp: true });
    expect(same(zero, base)).toBe(true);
    const f = newField(rect.width, rect.height);
    const out = new Uint8ClampedArray(base);
    applyField(base, out, f, 0, 0, rect.width, rect.height);
    expect(same(out, base)).toBe(true);
  });

  it('moves no operator by more than 0.06 face units, and nothing outside its ellipse', { timeout: 30_000 }, () => {
    for (const p of ops) {
      const f = fieldOf([p]);
      let max = 0;
      for (let i = 0; i < f.dx.length; i++) max = Math.max(max, shiftAt(f, i));
      expect(max, `${p.op.concernId}:${p.op.side}`).toBeLessThanOrEqual(MAX_SHIFT * unit + 1e-3);
      // Bridges are sized to the gap they fill (M5b) and may be small.
      if (!p.op.bridge) expect(max, `${p.op.concernId}:${p.op.side}`).toBeGreaterThan(0.01 * unit);
      // Every pixel outside the operator's box is untouched.
      let outside = 0;
      for (let y = 0; y < rect.height; y += 2)
        for (let x = 0; x < rect.width; x += 2) {
          const inside = x >= p.x0 && x < p.x1 && y >= p.y0 && y < p.y1;
          if (!inside && shiftAt(f, y * rect.width + x) !== 0) outside++;
        }
      expect(outside, `${p.op.concernId}:${p.op.side}`).toBe(0);
    }
  });

  it('never folds or tears the picture, even with every operator of a mode at full strength', () => {
    // Mode A runs every operator but the MD Codes-only ones; mode B every one but the mode-A-only ones.
    for (const mode of ['sites', 'area'] as const) {
      const f = fieldOf(ops.filter((o) => o.op.use !== mode), MAX_INTENSITY);
      // The mapping p → p − d stays one-to-one when det(I − ∇d) > 0 everywhere.
      let minDet = Infinity;
      for (let y = 1; y < rect.height - 1; y++)
        for (let x = 1; x < rect.width - 1; x++) minDet = Math.min(minDet, detAt(f, y * rect.width + x));
      expect(minDet, mode).toBeGreaterThan(0.3);
    }
    const f = fieldOf(ops, MAX_INTENSITY);
    // Nothing moves at the border of the working box, so the warped box meets the rest of the photo seamlessly.
    for (let x = 0; x < rect.width; x++) {
      expect(shiftAt(f, x)).toBe(0);
      expect(shiftAt(f, (rect.height - 1) * rect.width + x)).toBe(0);
    }
    for (let y = 0; y < rect.height; y++) {
      expect(shiftAt(f, y * rect.width)).toBe(0);
      expect(shiftAt(f, y * rect.width + rect.width - 1)).toBe(0);
    }
  });

  it('a man gets a wider, less lengthened chin than a woman (owner review: no pointed chin on a man)', () => {
    const set = buildRegions(mesh, { size: { width: FIXTURE.width, height: FIXTURE.height } });
    const chinOf = (sex: 'male' | 'female') => buildOperators(set, mesh, sex).filter((o) => o.concernId === 'chin');
    const [mDown, mWide] = chinOf('male');
    const [fDown, fWide] = chinOf('female');
    expect(mDown!.v!.y).toBeLessThan(fDown!.v!.y);
    expect(mWide!.rx).toBeGreaterThan(fWide!.rx);
    // The downward move is spread wider than the chin itself, so the lower border moves evenly instead of to a point.
    expect(mDown!.rx).toBeGreaterThan(mWide!.rx);
  });

  it('jaw operators sit on the face outline, not inside the cheek (owner review 2)', () => {
    const face = prepared.outlines.find((o) => o.concernId === 'skin-quality')!;
    for (const id of ['jawline', 'masseter'] as const)
      for (const p of opsOf(id, 'L')) {
        // The outline must cross the operator's ellipse: the operator works on the contour.
        const c = toPx(frame, p.op.c);
        const local = { x: c.x - rect.x, y: c.y - rect.y };
        const rxPx = p.op.rx * unit;
        const near = face.points.some((q) => Math.hypot((q.x - local.x) / rxPx, (q.y - local.y) / (p.op.ry * unit)) < 1);
        expect(near, id).toBe(true);
      }
  });

  it('never moves the eyes, even with every change at full strength', () => {
    render(prepared, W_CONCERNS.map((concernId) => ({ concernId, intensity: MAX_INTENSITY })));
    const f = prepared.field;
    // On the eyes the displacement is (almost) gone; compare with the same operators without the eye fade.
    const raw = fieldOf(ops, MAX_INTENSITY);
    let checked = 0;
    for (let i = 0; i < f.dx.length; i++) {
      if (prepared.still[i]! > 0.02) continue;
      checked++;
      expect(shiftAt(f, i)).toBeLessThanOrEqual(0.02 * shiftAt(raw, i) + 1e-9);
    }
    expect(checked).toBeGreaterThan(100);
    // The fade around the eyes does not fold the picture either.
    let minDet = Infinity;
    for (let y = 1; y < rect.height - 1; y++)
      for (let x = 1; x < rect.width - 1; x++) {
        const i = y * rect.width + x;
        const dxx = (f.dx[i + 1]! - f.dx[i - 1]!) / 2;
        const dxy = (f.dx[i + rect.width]! - f.dx[i - rect.width]!) / 2;
        const dyx = (f.dy[i + 1]! - f.dy[i - 1]!) / 2;
        const dyy = (f.dy[i + rect.width]! - f.dy[i - rect.width]!) / 2;
        minDet = Math.min(minDet, (1 - dxx) * (1 - dyy) - dxy * dyx);
      }
    expect(minDet).toBeGreaterThan(0.3);
  });

  it('fills each lip in proportion to its own thickness: same shape, no bulge in the middle (owner review 2026-11-15)', () => {
    for (const p of opsOf('lip-volume')) {
      const s = p.op.samples!;
      const shares = s.filter((k) => Math.abs(k.border - k.mouth) > 0.005).map((k) => k.d / Math.abs(k.border - k.mouth));
      expect(shares.length).toBeGreaterThan(3);
      for (const share of shares) expect(share).toBeCloseTo(shares[0]!, 6);
      // The corners (zero thickness) do not move.
      expect(s[0]!.d).toBeCloseTo(0, 6);
      expect(s[s.length - 1]!.d).toBeCloseTo(0, 6);
    }
  });

  it('moves each change the intended way', () => {
    // Field holds p − src: a negative dy means the content moves up.
    const brow = fieldOf(opsOf('brow', 'R'));
    const tail = opsOf('brow', 'R')[0]!.op.c;
    expect(at(brow, tail).dy).toBeLessThan(0);
    const masseter = fieldOf(opsOf('masseter', 'R'));
    expect(at(masseter, opsOf('masseter', 'R')[0]!.op.c).dx).toBeGreaterThan(0); // right side moves toward the midline (+x)
    const jowl = fieldOf(opsOf('jawline', 'L'));
    const j = at(jowl, opsOf('jawline', 'L')[0]!.op.c);
    expect(j.dy).toBeLessThan(0);
    expect(j.dx).toBeGreaterThanOrEqual(0); // never pulled inward: that made the jaw line concave (owner, 2026-11-15)
    const angle = opsOf('jawline', 'L')[1]!.op;
    expect(at(jowl, angle.c).dx).toBeGreaterThan(0); // left jaw angle a little fuller outward (+x)
    const chin = fieldOf(opsOf('chin'));
    expect(at(chin, opsOf('chin')[0]!.op.c).dy).toBeGreaterThan(0); // chin a little longer
    // Lips fill out: the upper border moves up, the lower border down.
    const [upper, lower] = opsOf('lip-volume');
    const lips = fieldOf(opsOf('lip-volume'));
    const midOf = (o: PlacedOperator) => o.op.samples!.reduce((b, s) => (Math.abs(s.x - o.op.c.x) < Math.abs(b.x - o.op.c.x) ? s : b));
    expect(at(lips, { x: midOf(upper!).x, y: midOf(upper!).border }).dy).toBeLessThan(0);
    expect(at(lips, { x: midOf(lower!).x, y: midOf(lower!).border }).dy).toBeGreaterThan(0);
  });

  it('mirrors: on a symmetric face the left field is the mirror image of the right one', () => {
    for (const id of ['midface-volume', 'masseter', 'jawline', 'brow', 'temple', 'marionette', 'nasolabial-fold'] as const) {
      const right = fieldOf(opsOf(id, 'R'));
      const left = fieldOf(opsOf(id, 'L'));
      for (const op of opsOf(id, 'R')) {
        for (const [ox, oy] of [[0, 0], [0.03, 0.02], [-0.02, 0.03]] as const) {
          const q = { x: op.op.c.x + ox, y: op.op.c.y + oy };
          const r = at(right, q);
          const l = at(left, { x: -q.x, y: q.y });
          expect(l.dx, id).toBeCloseTo(-r.dx, 0);
          expect(l.dy, id).toBeCloseTo(r.dy, 0);
        }
      }
    }
  });

  it('sets the sides apart: with the left side at zero only the right side changes', () => {
    const base = render(prepared, []);
    const rightOnly = render(prepared, [{ concernId: 'masseter', intensity: 0.85, left: 0 }]);
    const both = render(prepared, [{ concernId: 'masseter', intensity: 0.85 }]);
    const changed = (out: Uint8ClampedArray, side: 'R' | 'L') => {
      const p = opsOf('masseter', side)[0]!;
      let n = 0;
      for (let y = p.y0; y < p.y1; y++)
        for (let x = p.x0; x < p.x1; x++) {
          const i = (y * rect.width + x) * 4;
          if (out[i] !== base[i]) n++;
        }
      return n;
    };
    expect(changed(rightOnly, 'R')).toBeGreaterThan(50);
    expect(changed(rightOnly, 'L')).toBe(0);
    expect(changed(both, 'L')).toBeGreaterThan(50);
  });

  // ── M5b: MD Codes filler mode ──
  const K = MAX_INTENSITY;
  const siteOps = (site: MdSite, side: 'R' | 'L') => ops.filter((o) => o.op.site === site && !o.op.bridge && o.op.use !== 'area' && (o.op.side === side || o.op.side === 'M'));
  /** Field of mode B with the given sites filled at K: site operators plus the bridges between filled sites. */
  const modeB = (filled: readonly MdSite[], withBridges = true) => {
    const sites = filled.map((site) => ({ site, intensity: K }));
    const f = newField(rect.width, rect.height);
    for (const p of ops) {
      if (!withBridges && p.op.bridge) continue;
      addOperator(f, p, operatorStrength(p.op, [], sites));
    }
    return f;
  };
  /** Range of det along the segment between two face points (inner 70 %). Above 1 = squeezed skin, a groove. */
  const along = (f: Field, a: { x: number; y: number }, b: { x: number; y: number }) => {
    let max = 0;
    let min = Infinity;
    for (let t = 0.15; t <= 0.85; t += 0.02) {
      const p = toPx(frame, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      const d = detAt(f, (Math.round(p.y) - rect.y) * rect.width + Math.round(p.x) - rect.x);
      max = Math.max(max, d);
      min = Math.min(min, d);
    }
    return { max, min };
  };
  /** Strongest fill anywhere in a field: the smallest det. */
  const peak = (f: Field) => {
    let min = Infinity;
    for (let y = 1; y < rect.height - 1; y += 2) for (let x = 1; x < rect.width - 1; x += 2) min = Math.min(min, detAt(f, y * rect.width + x));
    return min;
  };

  it('has operators for every MD Codes site but Tt, Ck1–Ck3 apart on both sides', () => {
    for (const site of MD_SITES.filter((s) => s !== 'Tt')) expect(siteOps(site, 'R').length + siteOps(site, 'L').length, site).toBeGreaterThan(0);
    for (const site of ['Ck1', 'Ck2', 'Ck3'] as const) {
      expect(siteOps(site, 'R').length, site).toBeGreaterThan(0);
      expect(siteOps(site, 'R').length, site).toBe(siteOps(site, 'L').length);
    }
    // Ck1 lies lateral to Ck2, Ck2 lateral to Ck3 (subject's right = negative x).
    const cx = (site: MdSite) => siteOps(site, 'R')[0]!.op.c.x;
    expect(cx('Ck1')).toBeLessThan(cx('Ck2'));
    expect(cx('Ck2')).toBeLessThan(cx('Ck3'));
  });

  it('drives each operator from one mode only', () => {
    const cheekArea = ops.find((o) => o.op.concernId === 'midface-volume' && o.op.use === 'area')!.op;
    const ck1 = siteOps('Ck1', 'R')[0]!.op;
    const chin = siteOps('C', 'R')[0]!.op;
    const masseter = opsOf('masseter', 'R')[0]!.op;
    const area = [{ concernId: 'midface-volume' as const, intensity: 0.6 }, { concernId: 'chin' as const, intensity: 0.6 }];
    expect(operatorStrength(cheekArea, area, [])).toBeCloseTo(0.6);
    expect(operatorStrength(ck1, area, [])).toBe(0);
    expect(operatorStrength(chin, area, [])).toBeCloseTo(0.6);
    // Mode B: the concern sliders smooth only; the sites give the volume.
    const smooth = area.map((c) => ({ ...c, effect: 'smooth' as const }));
    const sites = [{ site: 'Ck1' as const, intensity: 0.4, left: 0.2 }, { site: 'C' as const, intensity: 0.5 }];
    expect(operatorStrength(cheekArea, smooth, sites)).toBe(0);
    expect(operatorStrength(ck1, smooth, sites)).toBeCloseTo(0.4);
    expect(operatorStrength(siteOps('Ck1', 'L')[0]!.op, smooth, sites)).toBeCloseTo(0.2);
    expect(operatorStrength(chin, smooth, sites)).toBeCloseTo(0.5);
    expect(operatorStrength(masseter, [{ concernId: 'masseter', intensity: 0.7 }], sites)).toBeCloseTo(0.7);
    // A bridge runs at the weaker of its two sites and is off when one of them is 0.
    const bridge = ops.find((o) => o.op.bridge)!.op;
    const [a, b] = bridge.bridge!;
    expect(operatorStrength(bridge, [], [{ site: a, intensity: 0.8 }, { site: b, intensity: 0.3 }])).toBeCloseTo(0.3);
    expect(operatorStrength(bridge, [], [{ site: a, intensity: 0.8 }])).toBe(0);
  });

  it('blends two filled neighbouring sites into one fill, without a groove between them', () => {
    let grooves = 0;
    for (const [a, b] of BRIDGES) {
      const pair = `${a}-${b}`;
      const ca = siteOps(a, 'R').find((o) => o.op.kind === 'inflate') ?? siteOps(a, 'R')[0]!;
      const cb = siteOps(b, 'R').find((o) => o.op.kind === 'inflate') ?? siteOps(b, 'R')[0]!;
      const without = along(modeB([a, b], false), ca.op.c, cb.op.c);
      const withB = along(modeB([a, b]), ca.op.c, cb.op.c);
      const own = Math.min(peak(modeB([a])), peak(modeB([b])));
      if (without.max > 1.01) grooves++;
      // No groove: the skin between the two sites is not squeezed once both are filled.
      expect(withB.max, pair).toBeLessThanOrEqual(1.01);
      // No new bump: the gap never fills more than either site does at its own centre.
      expect(withB.min, pair).toBeGreaterThanOrEqual(own - 0.05);
    }
    // Without the bridges most neighbouring pairs would show a groove (synthetic face: 5 of 6).
    expect(grooves).toBeGreaterThanOrEqual(4);
  });
});
