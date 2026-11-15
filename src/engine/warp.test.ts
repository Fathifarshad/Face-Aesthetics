import { describe, expect, it } from 'vitest';
import type { ConcernId } from '../data/types';
import { buildFrame, toPx } from './faceFrame';
import { FIXTURE, syntheticMesh, syntheticPicture } from './fixtures';
import { MAX_INTENSITY, prepare, render } from './pipeline';
import { addOperator, applyField, MAX_SHIFT, newField, type Field, type PlacedOperator } from './warp';

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
      expect(max, `${p.op.concernId}:${p.op.side}`).toBeGreaterThan(0.01 * unit);
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

  it('never folds or tears the picture, even with every operator at full strength', () => {
    const f = fieldOf(ops, MAX_INTENSITY);
    // The mapping p → p − d stays one-to-one when det(I − ∇d) > 0 everywhere.
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
    expect(j.dx).toBeLessThan(0); // left side moves in (−x)
    const chin = fieldOf(opsOf('chin'));
    expect(at(chin, opsOf('chin')[0]!.op.c).dy).toBeGreaterThan(0); // chin a little longer
    // Lips fill out: above the upper lip's centre the content moves up, below the lower lip's centre it moves down.
    const [upper, lower] = opsOf('lip-volume');
    const lips = fieldOf(opsOf('lip-volume'));
    expect(at(lips, { x: upper!.op.c.x, y: upper!.op.c.y - upper!.op.ry * 0.3 }).dy).toBeLessThan(0);
    expect(at(lips, { x: lower!.op.c.x, y: lower!.op.c.y + lower!.op.ry * 0.3 }).dy).toBeGreaterThan(0);
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
});
