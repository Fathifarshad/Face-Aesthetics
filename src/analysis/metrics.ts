import { mmPerPx, rollCorrect, rollDeg, irisDiameterPx, hasIris } from './calibration';
import { dist, distToVerticalLine, fitVerticalLine, mean, midpoint, radToDeg } from './geometry';
import { LM, MIDLINE_POINTS, SYMMETRY_PAIRS, type SymmetryRegion } from './landmarks';
import { NORMS, type MetricId } from './norms';
import { deviation, severityFromDeviation } from './severity';
import type { Finding, FindingTab, Landmarks, Point } from './types';

const at = (p: readonly Point[], i: number): Point => p[i]!;

export const stomion = (p: readonly Point[]): Point => midpoint(at(p, LM.stomionUpper), at(p, LM.stomionLower));

export const eyeWidthR = (p: readonly Point[]) => dist(at(p, LM.exocanthionR), at(p, LM.endocanthionR));
export const eyeWidthL = (p: readonly Point[]) => dist(at(p, LM.exocanthionL), at(p, LM.endocanthionL));
const meanEyeWidth = (p: readonly Point[]) => mean([eyeWidthR(p), eyeWidthL(p)]);

export function thirdsMiddleToLower(p: readonly Point[]): number {
  return dist(at(p, LM.glabella), at(p, LM.subnasale)) / dist(at(p, LM.subnasale), at(p, LM.menton));
}

export function lowerFaceRatio(p: readonly Point[]): number {
  const s = stomion(p);
  return dist(at(p, LM.subnasale), s) / dist(s, at(p, LM.menton));
}

/** Five horizontal segments (R outer, R eye, intercanthal, L eye, L outer) / mean eye width. Roll-corrected input. */
export function fifths(p: readonly Point[]): number[] {
  const w = meanEyeWidth(p);
  const xs = [LM.zygionR, LM.exocanthionR, LM.endocanthionR, LM.endocanthionL, LM.exocanthionL, LM.zygionL].map(
    (i) => at(p, i).x,
  );
  const segs: number[] = [];
  for (let i = 0; i < 5; i++) segs.push(Math.abs(xs[i + 1]! - xs[i]!) / w);
  return segs;
}

export const fifthsMaxDeviation = (segs: readonly number[]): number => Math.max(...segs.map((s) => Math.abs(s - 1)));

export function intercanthalRatio(p: readonly Point[]): number {
  return dist(at(p, LM.endocanthionR), at(p, LM.endocanthionL)) / meanEyeWidth(p);
}

/** Canthal tilt, degrees; positive = outer corner higher than inner corner. Roll-corrected input. */
export function canthalTilt(p: readonly Point[], side: 'R' | 'L'): number {
  const exo = at(p, side === 'R' ? LM.exocanthionR : LM.exocanthionL);
  const endo = at(p, side === 'R' ? LM.endocanthionR : LM.endocanthionL);
  return radToDeg(Math.atan2(endo.y - exo.y, Math.abs(endo.x - exo.x)));
}

export function lipsUpperToLower(p: readonly Point[]): number {
  const upper = Math.abs(at(p, LM.stomionUpper).y - at(p, LM.labraleSuperius).y);
  const lower = Math.abs(at(p, LM.labraleInferius).y - at(p, LM.stomionLower).y);
  return upper / lower;
}

/** Mouth width / distance between the medial iris edges (≈ 1 when commissures sit on the medial limbus lines). */
export function mouthWidthRatio(p: readonly Point[]): number | null {
  if (!hasIris(p)) return null;
  const irisD = mean([irisDiameterPx(p, LM.irisEdgesR), irisDiameterPx(p, LM.irisEdgesL)]);
  const medial = dist(at(p, LM.irisCenterR), at(p, LM.irisCenterL)) - irisD;
  return medial > 0 ? dist(at(p, LM.cheilionR), at(p, LM.cheilionL)) / medial : null;
}

export function noseWidthRatio(p: readonly Point[]): number {
  return dist(at(p, LM.alarR), at(p, LM.alarL)) / dist(at(p, LM.endocanthionR), at(p, LM.endocanthionL));
}

export function bizygomaticToBigonial(p: readonly Point[]): number {
  return dist(at(p, LM.zygionR), at(p, LM.zygionL)) / dist(at(p, LM.gonionR), at(p, LM.gonionL));
}

/** Vertical distance from the highest brow point to the pupil centre, mm (roll-corrected input). */
export function browHeightMm(p: readonly Point[], side: 'R' | 'L', mmPx: number): number {
  const brow = (side === 'R' ? LM.browR : LM.browL).map((i) => at(p, i));
  const peakY = Math.min(...brow.map((b) => b.y));
  const pupil = at(p, side === 'R' ? LM.irisCenterR : LM.irisCenterL);
  return (pupil.y - peakY) * mmPx;
}

/** Mean relative asymmetry (%) of paired points' distances to the fitted midline. */
export function symmetryPercent(p: readonly Point[], region: SymmetryRegion): number {
  const line = fitVerticalLine(MIDLINE_POINTS.map((i) => at(p, i)));
  const vals = SYMMETRY_PAIRS[region].map(([r, l]) => {
    const dr = distToVerticalLine(at(p, r), line);
    const dl = distToVerticalLine(at(p, l), line);
    const m = (dr + dl) / 2;
    return m === 0 ? 0 : (Math.abs(dr - dl) / m) * 100;
  });
  return mean(vals);
}

function metricFinding(
  id: MetricId,
  value: number | null,
  tab: FindingTab,
  confidence: number,
  planKeys: string[] = [],
  display?: string,
): Finding {
  const norm = NORMS[id];
  const d = value === null ? null : deviation(value, norm);
  const sev = d === null ? null : severityFromDeviation(d);
  return {
    key: id,
    tab,
    value,
    display,
    unit: norm.unit,
    reference: norm.referenceLabel,
    deviation: d,
    severitySuggested: sev,
    severity: sev,
    confidence,
    source: 'auto',
    status: 'pending',
    planKeys,
  };
}

/**
 * All automatic frontal metrics (docs/ANALYSIS_SPEC.md §4) from raw pixel landmarks.
 * Roll is corrected first; mm values are omitted when iris points are missing.
 */
export function frontalFindings(raw: Landmarks): Finding[] {
  const p = rollCorrect(raw);
  const roll = Math.abs(rollDeg(raw));
  const conf = roll > 8 ? 0.6 : roll > 4 ? 0.75 : 0.9;
  const mmPx = mmPerPx(p);
  const segs = fifths(p);
  const out: Finding[] = [
    metricFinding('thirds.middleToLower', thirdsMiddleToLower(p), 'proportions', conf, ['chin.retrusion']),
    metricFinding('lowerFace.ratio', lowerFaceRatio(p), 'proportions', conf, ['chin.retrusion']),
    metricFinding(
      'fifths',
      fifthsMaxDeviation(segs),
      'proportions',
      conf * 0.9,
      [],
      segs.map((s) => s.toFixed(2)).join(' · '),
    ),
    metricFinding('intercanthal.ratio', intercanthalRatio(p), 'proportions', conf),
    metricFinding('canthalTilt.R', canthalTilt(p, 'R'), 'proportions', conf, ['brow.ptosis']),
    metricFinding('canthalTilt.L', canthalTilt(p, 'L'), 'proportions', conf, ['brow.ptosis']),
    metricFinding('nose.width', noseWidthRatio(p), 'proportions', conf),
    metricFinding('faceShape.bizygomaticToBigonial', bizygomaticToBigonial(p), 'proportions', conf, [
      'jawline.definition',
    ]),
    metricFinding('lips.upperToLower', lipsUpperToLower(p), 'lips', conf, ['lips.volume']),
    metricFinding('mouth.width', mouthWidthRatio(p), 'lips', conf),
  ];
  if (mmPx !== null) {
    const asym = Math.abs(browHeightMm(p, 'R', mmPx) - browHeightMm(p, 'L', mmPx));
    out.push(metricFinding('brow.asymmetry', asym, 'proportions', conf * 0.8, ['brow.ptosis']));
  }
  for (const region of Object.keys(SYMMETRY_PAIRS) as SymmetryRegion[]) {
    out.push(metricFinding(`symmetry.${region}`, symmetryPercent(p, region), 'proportions', conf));
  }
  return out;
}
