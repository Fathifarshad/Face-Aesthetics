import { hasIris, irisDiameterPx, rollCorrect } from './calibration';
import { dist, fitVerticalLine, lerp, mean } from './geometry';
import { LM, MIDLINE_POINTS } from './landmarks';
import { LIP_FULLNESS_REFERENCE, PROXY_THRESHOLDS } from './norms';
import { gradeFromThresholds } from './severity';
import type { Landmarks, LuminanceSampler, Point, Severity } from './types';

export type ProxySuggestion = { key: string; value: number; severity: Severity; confidence: number };

/** Proxy confidence is deliberately low: these are uncalibrated heuristics (docs/ANALYSIS_SPEC.md §6). */
export const PROXY_CONFIDENCE = 0.35;

/** Mean luminance of a disc sampled on a 5×5 grid. */
export function discLuminance(sample: LuminanceSampler, c: Point, r: number): number {
  const vals: number[] = [];
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++) {
      if (i * i + j * j > 4) continue;
      vals.push(sample(c.x + (i / 2) * r, c.y + (j / 2) * r));
    }
  return mean(vals);
}

/** 1 − region/reference, floored at 0. */
export const relativeDarkness = (region: number, reference: number): number =>
  reference <= 0 ? 0 : Math.max(0, 1 - region / reference);

type Frame = {
  p: Point[];
  midX: (y: number) => number;
  eyeW: number;
  irisD: number;
  /** Unit step away from the midline for a point. */
  out: (pt: Point) => number;
  /** Map roll-corrected coordinates back to original image coordinates. */
  toImage: (pt: Point) => Point;
};

function frame(raw: Landmarks): Frame {
  const p = rollCorrect(raw);
  const line = fitVerticalLine(MIDLINE_POINTS.map((i) => p[i]!));
  const midX = (y: number) => line.slope * y + line.intercept;
  const eyeW = mean([dist(p[LM.exocanthionR]!, p[LM.endocanthionR]!), dist(p[LM.exocanthionL]!, p[LM.endocanthionL]!)]);
  const irisD = hasIris(p) ? mean([irisDiameterPx(p, LM.irisEdgesR), irisDiameterPx(p, LM.irisEdgesL)]) : eyeW * 0.38;
  // rollCorrect rotates about the eye midpoint; recover the inverse mapping from two reference points.
  const a0 = raw[LM.exocanthionR]!;
  const a1 = p[LM.exocanthionR]!;
  const b0 = raw[LM.exocanthionL]!;
  const b1 = p[LM.exocanthionL]!;
  const ang = Math.atan2(b0.y - a0.y, b0.x - a0.x) - Math.atan2(b1.y - a1.y, b1.x - a1.x);
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const toImage = (pt: Point): Point => {
    const dx = pt.x - a1.x;
    const dy = pt.y - a1.y;
    return { x: a0.x + dx * cos - dy * sin, y: a0.y + dx * sin + dy * cos };
  };
  return { p, midX, eyeW, irisD, out: (pt) => (pt.x >= midX(pt.y) ? 1 : -1), toImage };
}

function sideDarkness(
  f: Frame,
  sample: LuminanceSampler,
  region: (side: 'R' | 'L') => { at: Point; ref: Point; r: number },
): number {
  const vals = (['R', 'L'] as const).map((s) => {
    const { at, ref, r } = region(s);
    return relativeDarkness(discLuminance(sample, f.toImage(at), r), discLuminance(sample, f.toImage(ref), r));
  });
  return mean(vals);
}

export function tearTroughDarkness(raw: Landmarks, sample: LuminanceSampler): number {
  const f = frame(raw);
  return sideDarkness(f, sample, (s) => {
    const pupil = hasIris(f.p)
      ? f.p[s === 'R' ? LM.irisCenterR : LM.irisCenterL]!
      : lerp(f.p[s === 'R' ? LM.exocanthionR : LM.exocanthionL]!, f.p[s === 'R' ? LM.endocanthionR : LM.endocanthionL]!, 0.5);
    const o = f.out(pupil);
    return {
      at: { x: pupil.x - o * 0.2 * f.irisD, y: pupil.y + 1.35 * f.irisD },
      ref: { x: pupil.x + o * 0.3 * f.irisD, y: pupil.y + 3.0 * f.irisD },
      r: 0.35 * f.irisD,
    };
  });
}

export function nasolabialDarkness(raw: Landmarks, sample: LuminanceSampler): number {
  const f = frame(raw);
  return sideDarkness(f, sample, (s) => {
    const mid = lerp(f.p[s === 'R' ? LM.alarR : LM.alarL]!, f.p[s === 'R' ? LM.cheilionR : LM.cheilionL]!, 0.5);
    const o = f.out(mid);
    return {
      at: { x: mid.x + o * 0.18 * f.eyeW, y: mid.y },
      ref: { x: mid.x + o * 0.9 * f.eyeW, y: mid.y },
      r: 0.12 * f.eyeW,
    };
  });
}

export function marionetteDarkness(raw: Landmarks, sample: LuminanceSampler): number {
  const f = frame(raw);
  return sideDarkness(f, sample, (s) => {
    const c = f.p[s === 'R' ? LM.cheilionR : LM.cheilionL]!;
    const o = f.out(c);
    return {
      at: { x: c.x + o * 0.05 * f.eyeW, y: c.y + 0.45 * f.eyeW },
      ref: { x: c.x + o * 0.8 * f.eyeW, y: c.y + 0.3 * f.eyeW },
      r: 0.12 * f.eyeW,
    };
  });
}

/** 1 − (red-lip height / mouth width) / reference, floored at 0. Roll-corrected internally. */
export function lipDeficiency(raw: Landmarks): number {
  const p = rollCorrect(raw);
  const total = Math.abs(p[LM.labraleInferius]!.y - p[LM.labraleSuperius]!.y);
  const gap = Math.abs(p[LM.stomionLower]!.y - p[LM.stomionUpper]!.y);
  const width = dist(p[LM.cheilionR]!, p[LM.cheilionL]!);
  if (width === 0) return 0;
  return Math.max(0, 1 - (total - gap) / width / LIP_FULLNESS_REFERENCE);
}

/** Pre-selected grades for the clinician (never final). */
export function proxySuggestions(raw: Landmarks, sample: LuminanceSampler | null): ProxySuggestion[] {
  const out: ProxySuggestion[] = [];
  const add = (key: string, value: number, th: readonly number[]) =>
    out.push({ key, value, severity: gradeFromThresholds(value, th), confidence: PROXY_CONFIDENCE });
  if (sample) {
    add('teartrough', tearTroughDarkness(raw, sample), PROXY_THRESHOLDS.teartrough);
    add('nasolabial', nasolabialDarkness(raw, sample), PROXY_THRESHOLDS.nasolabial);
    add('marionette', marionetteDarkness(raw, sample), PROXY_THRESHOLDS.marionette);
  }
  add('lips.volume', lipDeficiency(raw), PROXY_THRESHOLDS.lipsVolume);
  return out;
}
