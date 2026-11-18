import { describe, expect, it } from 'vitest';
import type { Point } from '../analysis/types';
import { ANCHOR, L_EYE_LOWER, L_EYE_UPPER, R_EYE_LOWER, R_EYE_UPPER } from '../engine/landmarks';
import { LIVE, eyeMotion, eyeOpenness, liveHint, stepHold, type LiveInput } from './autoCapture';
import { VIEWS } from './views';

const frontal = VIEWS.find((v) => v.frontal && !v.manualAllowed)!;

/** Synthetic mesh: only the eye points matter here. Eyes 100 px wide, lids `gap` px apart, shifted by `dx`. */
function face(gap: number, dx = 0): Point[] {
  const lm: Point[] = Array.from({ length: 478 }, () => ({ x: 500 + dx, y: 500 }));
  const eye = (
    outer: number,
    inner: number,
    upper: readonly number[],
    lower: readonly number[],
    x0: number,
  ) => {
    lm[outer] = { x: x0 + dx, y: 400 };
    lm[inner] = { x: x0 + 100 + dx, y: 400 };
    for (const i of [3, 4, 5]) {
      lm[upper[i]!] = { x: x0 + 50 + dx, y: 400 - gap / 2 };
      lm[lower[i]!] = { x: x0 + 50 + dx, y: 400 + gap / 2 };
    }
  };
  eye(ANCHOR.rEyeOuter, ANCHOR.rEyeInner, R_EYE_UPPER, R_EYE_LOWER, 300);
  eye(ANCHOR.lEyeOuter, ANCHOR.lEyeInner, L_EYE_UPPER, L_EYE_LOWER, 600);
  return lm;
}

const good = (over: Partial<LiveInput> = {}): LiveInput => ({
  faces: 1,
  pose: { yaw: 0, pitch: 0, roll: 0 },
  landmarks: face(30),
  width: 1000,
  height: 1000,
  stats: { faceHeightRatio: 0.55, faceLum: 140, cheekDiff: 0.05, blur: 100, backlight: 1 },
  motion: 0.005,
  eyes: { open: 0.3, peak: 0.3 },
  ...over,
});

describe('auto capture checks (R2)', () => {
  it('measures eye opening as lid gap over eye width', () => {
    expect(eyeOpenness(face(30))).toBeCloseTo(0.3);
    expect(eyeOpenness(face(0))).toBeCloseTo(0);
    expect(eyeOpenness(null)).toBeNull();
  });

  it('measures eye-line movement in eye-corner distances', () => {
    // Outer corners are 400 px apart; a 4 px shift is 1 %.
    expect(eyeMotion(face(30), face(30, 4))).toBeCloseTo(0.01);
    expect(eyeMotion(null, face(30))).toBeNull();
  });

  it('is ready only when every check passes', () => {
    expect(liveHint(good(), frontal)).toBe('ready');
  });

  it('names the first thing to fix, pose before size before light before stillness', () => {
    expect(liveHint(good({ faces: 0, pose: null }), frontal)).toBe('noFace');
    expect(liveHint(good({ pose: { yaw: 20, pitch: 0, roll: 0 } }), frontal)).toBe('faceCamera');
    expect(liveHint(good({ pose: { yaw: 0, pitch: 20, roll: 0 } }), frontal)).toBe('chinLevel');
    const stats = good().stats!;
    expect(liveHint(good({ stats: { ...stats, faceHeightRatio: 0.3 } }), frontal)).toBe('closer');
    expect(liveHint(good({ stats: { ...stats, faceHeightRatio: 0.8 } }), frontal)).toBe('farther');
    expect(liveHint(good({ stats: { ...stats, faceLum: 40 } }), frontal)).toBe('moreLight');
    expect(liveHint(good({ stats: { ...stats, faceLum: 240 } }), frontal)).toBe('lessLight');
    expect(liveHint(good({ stats: { ...stats, cheekDiff: 0.4 } }), frontal)).toBe('evenLight');
    expect(liveHint(good({ stats: { ...stats, backlight: 2 } }), frontal)).toBe('backlight');
    expect(liveHint(good({ stats: { ...stats, blur: 5 } }), frontal)).toBe('blurry');
    expect(liveHint(good({ stats: { ...stats, faceLum: 40 }, motion: 0.2 }), frontal)).toBe('moreLight');
  });

  it('waits for still frames: a moving head or the first frame is not ready', () => {
    expect(liveHint(good({ motion: LIVE.motionMax * 2 }), frontal)).toBe('holdStill');
    expect(liveHint(good({ motion: null }), frontal)).toBe('holdStill');
  });

  it('does not shoot during a blink', () => {
    expect(liveHint(good({ eyes: { open: 0.1, peak: 0.3 } }), frontal)).toBe('eyesClosed');
    expect(liveHint(good({ eyes: { open: 0.03, peak: 0.03 } }), frontal)).toBe('eyesClosed');
    // Narrow eyes that never open wider are not a blink.
    expect(liveHint(good({ eyes: { open: 0.15, peak: 0.16 } }), frontal)).toBe('ready');
  });

  it('for an "after" photo, waits until the framing matches the "before" photo', () => {
    const reference = { landmarks: face(30), width: 1000, height: 1000 };
    expect(liveHint(good({ reference }), frontal)).toBe('ready');
    expect(liveHint(good({ reference, landmarks: face(30, 150) }), frontal)).toBe('frame');
  });

  it('fires once the checks have held for the hold time, and a failing frame starts over', () => {
    let h = stepHold({ since: null }, true, 1000);
    expect(h.progress).toBe(0);
    expect(h.fire).toBe(false);
    h = stepHold(h.hold, true, 1000 + LIVE.holdMs / 2);
    expect(h.progress).toBeCloseTo(0.5);
    const broken = stepHold(h.hold, false, 1000 + LIVE.holdMs * 0.9);
    expect(broken.hold.since).toBeNull();
    h = stepHold(h.hold, true, 1000 + LIVE.holdMs);
    expect(h.fire).toBe(true);
  });
});
