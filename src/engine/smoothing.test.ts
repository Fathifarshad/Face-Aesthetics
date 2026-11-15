import { describe, expect, it } from 'vitest';
import { compose, decompose, HIGHLIGHT_KEEP, newAttenuation, SMOOTH_COEFFICIENTS, type SmoothType } from './bands';
import { boxBlur3 } from './blur';
import { buildFrame, toPx } from './faceFrame';
import { FIXTURE, syntheticMesh, syntheticPicture } from './fixtures';
import { hairMap, medianLuma } from './hair';
import { buildMask, fillPolygon, limitMask, stampMax } from './masks';
import { MAX_INTENSITY, prepare, render, SMOOTHING } from './pipeline';
import { buildRegions, outlinePx } from './regions';
import { pointInPolygon } from './shapes';

const SKIN = [205, 160, 135] as const;

/** Uniform skin-coloured RGBA picture with horizontal stripes: [centre row, half height, brightness offset]. */
function striped(width: number, height: number, stripes: [number, number, number][]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const offset = stripes.reduce((t, [row, half, d]) => (Math.abs(y - row) <= half ? t + d : t), 0);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = SKIN[0] + offset;
      data[i + 1] = SKIN[1] + offset;
      data[i + 2] = SKIN[2] + offset;
      data[i + 3] = 255;
    }
  }
  return data;
}
const red = (data: Uint8ClampedArray, width: number, x: number, y: number) => data[(y * width + x) * 4]!;
/** Byte-for-byte comparison; `toEqual` on arrays of this size takes seconds. */
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && a.every((v, i) => v === b[i]);

describe('box blur', () => {
  it('leaves a uniform picture exactly uniform, also at the edges', () => {
    const out = boxBlur3(new Float32Array(40 * 30).fill(120), 40, 30, 5);
    expect(Math.min(...out)).toBeCloseTo(120, 4);
    expect(Math.max(...out)).toBeCloseTo(120, 4);
  });

  it('spreads a point without losing brightness, and returns a copy for radius 0', () => {
    const src = new Float32Array(41 * 41);
    src[20 * 41 + 20] = 1000;
    const out = boxBlur3(src, 41, 41, 3);
    expect(out[20 * 41 + 20]!).toBeLessThan(100);
    expect(out[20 * 41 + 24]!).toBeGreaterThan(0);
    expect(out.reduce((t, v) => t + v, 0)).toBeCloseTo(1000, 2);
    const same = boxBlur3(src, 41, 41, 0);
    expect(same).not.toBe(src);
    expect(same[20 * 41 + 20]).toBe(1000);
  });
});

describe('masks', () => {
  const square = [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }];

  it('fills exactly the pixels whose centre is inside the polygon', () => {
    const m = fillPolygon(square, 0, 0, 30, 30);
    expect(m.reduce((t, v) => t + v, 0)).toBe(100);
    expect(m[10 * 30 + 10]).toBe(1);
    expect(m[19 * 30 + 19]).toBe(1);
    expect(m[20 * 30 + 20]).toBe(0);
    expect(m[9 * 30 + 15]).toBe(0);
  });

  it('gives a soft edge: full in the middle, zero well outside, in between at the border', () => {
    const big = [{ x: 30, y: 30 }, { x: 90, y: 30 }, { x: 90, y: 90 }, { x: 30, y: 90 }];
    const m = buildMask(big, { width: 120, height: 120 }, 4);
    const at = (x: number, y: number) => m.data[(y - m.y) * m.width + (x - m.x)]!;
    expect(at(60, 60)).toBeCloseTo(1, 5);
    expect(at(30, 60)).toBeGreaterThan(0.3);
    expect(at(30, 60)).toBeLessThan(0.7);
    expect(at(m.x, 60)).toBeCloseTo(0, 5);
    expect(m.x).toBeGreaterThanOrEqual(0);
    expect(m.x + m.width).toBeLessThanOrEqual(120);
  });

  it('is cut down by a protected area and by the face outline', () => {
    const bounds = { width: 60, height: 60 };
    const m = buildMask([{ x: 5, y: 5 }, { x: 55, y: 5 }, { x: 55, y: 55 }, { x: 5, y: 55 }], bounds, 1);
    const protect = new Float32Array(60 * 60);
    stampMax(protect, 60, buildMask([{ x: 20, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 30 }, { x: 20, y: 30 }], bounds, 1));
    const face = new Float32Array(60 * 60);
    stampMax(face, 60, buildMask([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 60 }, { x: 0, y: 60 }], bounds, 1));
    limitMask(m, 60, face, protect);
    const at = (x: number, y: number) => m.data[(y - m.y) * m.width + (x - m.x)]!;
    expect(at(25, 25)).toBeCloseTo(0, 5); // protected
    expect(at(12, 40)).toBeCloseTo(1, 5); // free skin
    expect(at(50, 40)).toBeCloseTo(0, 5); // outside the face
  });
});

describe('band smoothing', () => {
  const W = 400;
  const H = 240;
  const ROW = 120;
  /** Region mask: a box around the middle part of the stripe; the ends of the stripe stay outside. */
  const mask = buildMask([{ x: 120, y: 70 }, { x: 280, y: 70 }, { x: 280, y: 170 }, { x: 120, y: 170 }], { width: W, height: H }, 6);

  function smooth(src: Uint8ClampedArray, type: SmoothType, strength = 1) {
    const dec = decompose(src, W, H, W);
    const att = newAttenuation(W * H);
    const c = SMOOTH_COEFFICIENTS[type];
    for (let row = 0; row < mask.height; row++)
      for (let col = 0; col < mask.width; col++) {
        const i = (mask.y + row) * W + mask.x + col;
        const m = mask.data[row * mask.width + col]! * strength;
        att.fine[i] = m * c.fine;
        att.band1[i] = m * c.band1;
        att.band2[i] = m * c.band2;
        att.band3[i] = m * c.band3;
        att.band4[i] = m * c.band4;
      }
    const out = new Uint8ClampedArray(src);
    compose(dec, att, out, 0, 0, W, H);
    return out;
  }

  it('adds the layers back to the untouched picture exactly', () => {
    const src = striped(W, H, [[ROW, 3, -60], [60, 1, 30]]);
    const dec = decompose(src, W, H, W);
    const out = new Uint8ClampedArray(src);
    const att = newAttenuation(W * H);
    att.fine.fill(1e-9); // forces every pixel through the mix with (almost) no attenuation
    compose(dec, att, out, 0, 0, W, H);
    expect(same(out, src)).toBe(true);
  });

  // A line of the width each type is made for: a wrinkle for "fine", a fold for "deep", a broad shadow for "hollow".
  it.each([
    ['fine', 4, 60],
    ['deep', 5, 60],
    ['hollow', 10, 60],
  ] as const)('%s: a dark line (half width %i px) loses at least 60 %% of its contrast', (type, half, depth) => {
    const src = striped(W, H, [[ROW, half, -depth]]);
    const out = smooth(src, type);
    const before = SKIN[0] - red(src, W, 200, ROW);
    const after = SKIN[0] - red(out, W, 200, ROW);
    expect(before).toBe(depth);
    expect(after / before, `${type}: ${after} of ${before} left`).toBeLessThanOrEqual(0.4);
  });

  it('changes nothing outside the mask', () => {
    const src = striped(W, H, [[ROW, 3, -60]]);
    const out = smooth(src, 'deep');
    let changedOutside = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const inBox = x >= mask.x && x < mask.x + mask.width && y >= mask.y && y < mask.y + mask.height;
        const m = inBox ? mask.data[(y - mask.y) * mask.width + (x - mask.x)]! : 0;
        if (m === 0 && red(out, W, x, y) !== red(src, W, x, y)) changedOutside++;
      }
    expect(changedOutside).toBe(0);
    // The stripe is untouched where the mask does not reach.
    expect(red(out, W, 40, ROW)).toBe(SKIN[0] - 60);
  });

  it('leaves no bright rim beside the line and does not touch the alpha channel', () => {
    const src = striped(W, H, [[ROW, 3, -60]]);
    const out = smooth(src, 'fine');
    let brightest = 0;
    for (let y = 70; y < 170; y++) brightest = Math.max(brightest, red(out, W, 200, y));
    expect(brightest).toBeLessThanOrEqual(SKIN[0] + 1);
    expect(out[(ROW * W + 200) * 4 + 3]).toBe(255);
  });

  it('flattens a highlight much less than it lifts a shadow', () => {
    const dark = SKIN[0] - red(smooth(striped(W, H, [[ROW, 3, -40]]), 'fine'), W, 200, ROW);
    const bright = red(smooth(striped(W, H, [[ROW, 3, 40]]), 'fine'), W, 200, ROW) - SKIN[0];
    expect(dark).toBeLessThan(16); // the shadow is mostly gone
    expect(bright).toBeGreaterThan(25); // the highlight mostly stays
    expect(HIGHLIGHT_KEEP).toBe(0.4);
  });

  it('scales with strength and does nothing at zero', () => {
    const src = striped(W, H, [[ROW, 3, -60]]);
    expect(same(smooth(src, 'fine', 0), src)).toBe(true);
    const half = SKIN[0] - red(smooth(src, 'fine', 0.5), W, 200, ROW);
    const full = SKIN[0] - red(smooth(src, 'fine', 1), W, 200, ROW);
    expect(full).toBeLessThan(half);
    expect(half).toBeLessThan(60);
  });
});

describe('pipeline on the synthetic face', () => {
  const mesh = syntheticMesh();
  const frame = buildFrame(mesh);
  const size = { width: FIXTURE.width, height: FIXTURE.height };

  /** Synthetic picture with a dark forehead line and dark lines along both nasolabial folds. */
  function picture() {
    const pic = syntheticPicture(-1.0);
    const darken = (cx: number, cy: number, r: number) => {
      for (let y = Math.round(cy - r); y <= cy + r; y++)
        for (let x = Math.round(cx - r); x <= cx + r; x++) {
          const i = (y * pic.width + x) * 4;
          pic.data[i] = SKIN[0] - 50;
          pic.data[i + 1] = SKIN[1] - 50;
          pic.data[i + 2] = SKIN[2] - 50;
        }
    };
    for (let x = -0.3; x <= 0.3; x += 0.005) {
      const p = toPx(frame, { x, y: -0.5 });
      darken(p.x, p.y, 2);
    }
    for (const s of [-1, 1])
      for (let t = 0.15; t <= 0.85; t += 0.01) {
        const p = toPx(frame, { x: s * (0.27 + 0.17 * t), y: 0.47 + 0.39 * t });
        darken(p.x, p.y, 3);
      }
    return pic;
  }

  const pic = picture();
  const prepared = prepare({ ...pic, landmarks: mesh });
  const { rect } = prepared;
  const at = (out: Uint8ClampedArray, q: { x: number; y: number }) => {
    const p = toPx(frame, q);
    return out[((Math.round(p.y) - rect.y) * rect.width + Math.round(p.x) - rect.x) * 4]!;
  };

  it('offers exactly the concerns that have a smoothing effect and a region', () => {
    expect(prepared.available).toEqual(Object.entries(SMOOTHING).filter(([, v]) => v).map(([k]) => k));
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(size.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(size.height);
  });

  it('returns the photo unchanged when nothing is switched on', () => {
    const out = render(prepared, []);
    for (let row = 0; row < rect.height; row += 7)
      for (let col = 0; col < rect.width; col += 7) {
        const i = (row * rect.width + col) * 4;
        expect(out[i]).toBe(pic.data[((rect.y + row) * pic.width + rect.x + col) * 4]);
      }
    expect(same(render(prepared, [{ concernId: 'forehead-lines', intensity: 0 }]), out)).toBe(true);
    // Concerns without a smoothing effect are ignored, not an error.
    expect(same(render(prepared, [{ concernId: 'lip-volume', intensity: 1 }]), out)).toBe(true);
  });

  it('softens the forehead line and leaves the nasolabial lines alone, and the other way round', () => {
    const base = render(prepared, []);
    const forehead = render(prepared, [{ concernId: 'forehead-lines', intensity: 0.85 }]);
    const fold = render(prepared, [{ concernId: 'nasolabial-fold', intensity: 0.85 }]);
    const onForehead = { x: 0, y: -0.5 };
    const onFold = { x: -(0.27 + 0.17 * 0.5), y: 0.47 + 0.39 * 0.5 };
    expect(at(base, onForehead)).toBe(SKIN[0] - 50);
    expect(SKIN[0] - at(forehead, onForehead)).toBeLessThan(30); // at the 85 % cap: at least 40 % of the line is gone
    expect(at(forehead, onFold)).toBe(at(base, onFold));
    expect(SKIN[0] - at(fold, onFold)).toBeLessThan(30);
    expect(at(fold, onForehead)).toBe(at(base, onForehead));
    // Both folds are treated: the left one mirrors the right one.
    expect(SKIN[0] - at(fold, { x: -onFold.x, y: onFold.y })).toBeLessThan(30);
  });

  it('caps every effect at 85 %', () => {
    expect(MAX_INTENSITY).toBe(0.85);
    const capped = render(prepared, [{ concernId: 'forehead-lines', intensity: 0.85 }]);
    expect(same(render(prepared, [{ concernId: 'forehead-lines', intensity: 1 }]), capped)).toBe(true);
    expect(same(render(prepared, [{ concernId: 'forehead-lines', intensity: 0.5 }]), capped)).toBe(false);
  });

  it('never changes a pixel inside the eyes, brows, nostrils or lips, even with everything at full strength', () => {
    const base = render(prepared, []);
    const everything = render(prepared, prepared.available.map((concernId) => ({ concernId, intensity: 1 })));
    const set = buildRegions(mesh, { size });
    const protectedShapes = set.regions.filter((r) => r.protect).map((r) => outlinePx(set, r));
    let changed = 0;
    let checked = 0;
    let changedElsewhere = 0;
    for (let row = 0; row < rect.height; row += 2)
      for (let col = 0; col < rect.width; col += 2) {
        const i = (row * rect.width + col) * 4;
        const differs = everything[i] !== base[i] || everything[i + 1] !== base[i + 1] || everything[i + 2] !== base[i + 2];
        // Two pixels inside the outline, so the soft edge of the protection is not counted.
        const p = { x: rect.x + col, y: rect.y + row };
        const inside = protectedShapes.some((shape) =>
          [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]].every(([dx, dy]) => pointInPolygon({ x: p.x + dx!, y: p.y + dy! }, shape)),
        );
        if (inside) {
          checked++;
          if (differs) changed++;
        } else if (differs) changedElsewhere++;
      }
    expect(checked).toBeGreaterThan(500);
    expect(changed).toBe(0);
    expect(changedElsewhere).toBeGreaterThan(1000);
  });
});

describe('hair map', () => {
  const W = 120;
  const H = 60;
  const all = new Float32Array(W * H).fill(1);

  it('finds a dense dark patch (moustache) but not a fold that is only a little darker than the skin', () => {
    // Left: dark hair patch, 30 levels of noise inside it. Right: a fold 25 levels darker than the skin.
    const data = striped(W, H, []);
    for (let y = 20; y < 40; y++) {
      for (let x = 10; x < 50; x++) {
        const i = (y * W + x) * 4;
        const v = 50 + ((x * 7 + y * 13) % 30);
        data[i] = data[i + 1] = data[i + 2] = v;
      }
      for (let x = 80; x < 84; x++) {
        const i = (y * W + x) * 4;
        data[i] = data[i]! - 25;
        data[i + 1] = data[i + 1]! - 25;
        data[i + 2] = data[i + 2]! - 25;
      }
    }
    const skin = medianLuma(data, all)!;
    expect(skin).toBeGreaterThan(150);
    const hair = hairMap(data, W, H, skin, 2, 2);
    expect(hair[30 * W + 30]).toBe(1);
    expect(hair[30 * W + 82]).toBe(0);
    expect(hair[5 * W + 100]).toBe(0);
  });

  it('ignores single dark specks (pores, a mole smaller than the grain)', () => {
    const data = striped(W, H, []);
    for (const [x, y] of [[20, 20], [60, 30], [90, 45]]) {
      const i = (y! * W + x!) * 4;
      data[i] = data[i + 1] = data[i + 2] = 30;
    }
    const hair = hairMap(data, W, H, medianLuma(data, all)!, 3, 2);
    expect(Math.max(...hair)).toBe(0);
  });

  it('returns null for the reference skin when the reference area is empty', () => {
    expect(medianLuma(striped(W, H, []), new Float32Array(W * H))).toBeNull();
  });
});
