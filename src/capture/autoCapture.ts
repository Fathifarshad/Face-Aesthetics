import type { Point, Pose } from '../analysis/types';
import { ANCHOR, L_EYE_LOWER, L_EYE_UPPER, R_EYE_LOWER, R_EYE_UPPER } from '../engine/landmarks';
import { frameMatches, type Framed } from './align';
import { poseHint } from './camera';
import { QC_THRESHOLDS } from './qc';
import type { ViewDef } from './views';

/**
 * Automatic capture (Release 1.1 R2). Pure helpers: the live camera measures every analysed frame, `liveHint`
 * names the first thing to fix, and `stepHold` fires once every check has held for `holdMs`.
 *
 * Technical photo-quality limits, not clinical values. Light, size, sharpness and backlight reuse the
 * after-capture limits (`QC_THRESHOLDS`), so a photo the camera takes by itself also passes the confirm step.
 */
export const LIVE = {
  /** All checks must hold this long without a break before the photo is taken. */
  holdMs: 800,
  /** Largest movement of the eye line between two analysed frames, as a share of the eye-corner distance. */
  motionMax: 0.03,
  /** Eyes count as closed below this share of the widest opening seen while the camera is open (a blink). */
  eyeOpenShare: 0.6,
  /** Opening (lid gap / eye width) below which the eyes are closed whatever was seen before. */
  eyeOpenMin: 0.06,
} as const;

export type LiveHint =
  | 'noFace'
  | 'manyFaces'
  | 'faceCamera'
  | 'turnMore'
  | 'turnLess'
  | 'level'
  | 'chinLevel'
  | 'closer'
  | 'farther'
  | 'frame'
  | 'moreLight'
  | 'lessLight'
  | 'evenLight'
  | 'backlight'
  | 'eyesClosed'
  | 'holdStill'
  | 'blurry'
  | 'ready';

/** Image measurements of one frame (`faceStats` on the downscaled grey frame). */
export type FrameStats = {
  faceHeightRatio: number | null;
  faceLum: number | null;
  cheekDiff: number | null;
  blur: number | null;
  backlight: number | null;
};

export type LiveInput = {
  faces: number;
  pose: Pose | null;
  /** Mesh landmarks of the first face in video pixels. */
  landmarks: readonly Point[] | null;
  width: number;
  height: number;
  stats: FrameStats | null;
  /** Eye-line movement since the previous analysed frame (`eyeMotion`); null on the first frame. */
  motion: number | null;
  /** Current eye opening and the widest seen so far (`eyeOpenness`). */
  eyes: { open: number; peak: number } | null;
  /** The "before" photo of this view when the "after" one is taken (PRD F8.2). */
  reference?: Framed | null;
};

const within = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;

/** Lid gap over eye width, both eyes averaged, from the three middle points of each lid. Null without landmarks. */
export function eyeOpenness(lm: readonly Point[] | null): number | null {
  if (!lm) return null;
  const one = (upper: readonly number[], lower: readonly number[], a: number, b: number): number | null => {
    const pa = lm[a];
    const pb = lm[b];
    if (!pa || !pb) return null;
    const width = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    if (width === 0) return null;
    let gap = 0;
    for (const i of [3, 4, 5]) {
      const u = lm[upper[i]!];
      const l = lm[lower[i]!];
      if (!u || !l) return null;
      gap += Math.hypot(u.x - l.x, u.y - l.y);
    }
    return gap / 3 / width;
  };
  const r = one(R_EYE_UPPER, R_EYE_LOWER, ANCHOR.rEyeOuter, ANCHOR.rEyeInner);
  const l = one(L_EYE_UPPER, L_EYE_LOWER, ANCHOR.lEyeOuter, ANCHOR.lEyeInner);
  return r === null || l === null ? null : (r + l) / 2;
}

/** Movement of the eye line (both outer corners) between two frames, in eye-corner distances. */
export function eyeMotion(prev: readonly Point[] | null, cur: readonly Point[] | null): number | null {
  const pr = prev?.[ANCHOR.rEyeOuter];
  const pl = prev?.[ANCHOR.lEyeOuter];
  const cr = cur?.[ANCHOR.rEyeOuter];
  const cl = cur?.[ANCHOR.lEyeOuter];
  if (!pr || !pl || !cr || !cl) return null;
  const span = Math.hypot(cl.x - cr.x, cl.y - cr.y);
  if (span === 0) return null;
  return Math.max(Math.hypot(cr.x - pr.x, cr.y - pr.y), Math.hypot(cl.x - pl.x, cl.y - pl.y)) / span;
}

/** The first thing to fix before the photo can be taken, in the order the patient can act on it. */
export function liveHint(input: LiveInput, view: ViewDef): LiveHint {
  const pose = poseHint(input.faces, input.pose, view);
  if (pose !== 'ready') return pose;
  // Same pitch rule as the after-capture check (`evaluateQc`).
  if (input.pose && view.id !== 'submental' && Math.abs(input.pose.pitch) > Math.max(view.tolerance, 8))
    return 'chinLevel';
  const s = input.stats;
  if (view.frontal && s?.faceHeightRatio != null && !within(s.faceHeightRatio, QC_THRESHOLDS.faceHeight)) {
    return s.faceHeightRatio < QC_THRESHOLDS.faceHeight[0] ? 'closer' : 'farther';
  }
  if (input.reference && frameMatches(input.reference, input) === false) return 'frame';
  if (s?.faceLum != null && !within(s.faceLum, QC_THRESHOLDS.luminance)) {
    return s.faceLum < QC_THRESHOLDS.luminance[0] ? 'moreLight' : 'lessLight';
  }
  if (view.frontal && s?.cheekDiff != null && s.cheekDiff >= QC_THRESHOLDS.cheekDiff) return 'evenLight';
  if (s?.backlight != null && s.backlight > QC_THRESHOLDS.backlightMax) return 'backlight';
  if (
    input.eyes &&
    (input.eyes.open < LIVE.eyeOpenMin || input.eyes.open < input.eyes.peak * LIVE.eyeOpenShare)
  )
    return 'eyesClosed';
  if (input.motion === null || input.motion > LIVE.motionMax) return 'holdStill';
  if (s?.blur != null && s.blur < QC_THRESHOLDS.blurMin) return 'blurry';
  return 'ready';
}

/** Time since every check started to hold; null while any check fails. */
export type Hold = { since: number | null };

/**
 * One analysed frame: a failing frame restarts the hold, a passing one keeps it. `progress` 0–1 drives the ring
 * around the shutter; `fire` is true on the first frame at or past `holdMs`.
 */
export function stepHold(
  hold: Hold,
  ready: boolean,
  now: number,
  holdMs: number = LIVE.holdMs,
): { hold: Hold; progress: number; fire: boolean } {
  if (!ready) return { hold: { since: null }, progress: 0, fire: false };
  const since = hold.since ?? now;
  const progress = Math.min(1, (now - since) / holdMs);
  return { hold: { since }, progress, fire: progress >= 1 };
}
