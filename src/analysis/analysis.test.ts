import { describe, expect, it } from 'vitest';
import { buildFindings, planSeverities } from './analyze';
import { IRIS_DIAMETER_MM, mmPerPx, rollCorrect, rollDeg } from './calibration';
import { ageBandOf } from './catalog';
import { syntheticFace, rotated } from './fixtures';
import { angleAt, dist, fitVerticalLine, pointInPolygon, rotate, signedDistToLine } from './geometry';
import {
  bizygomaticToBigonial,
  browHeightMm,
  canthalTilt,
  fifths,
  frontalFindings,
  intercanthalRatio,
  lipsUpperToLower,
  lowerFaceRatio,
  mouthWidthRatio,
  noseWidthRatio,
  symmetryPercent,
  thirdsMiddleToLower,
} from './metrics';
import { NORMS } from './norms';
import { matrixFromPose, poseFromMatrix } from './pose';
import { discLuminance, lipDeficiency, proxySuggestions, relativeDarkness, tearTroughDarkness } from './proxies';
import { deviation, gradeFromThresholds, severityFromDeviation } from './severity';

const face = syntheticFace();
const tilt = (Math.atan2(6, 60) * 180) / Math.PI;

describe('geometry', () => {
  it('rotates and measures', () => {
    const r = rotate({ x: 10, y: 0 }, { x: 0, y: 0 }, 90);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(10);
    expect(angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90);
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(signedDistToLine({ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(2 / 2);
  });
  it('fits a vertical line', () => {
    const l = fitVerticalLine([
      { x: 5, y: 0 },
      { x: 5, y: 10 },
      { x: 5, y: 20 },
    ]);
    expect(l.slope).toBeCloseTo(0);
    expect(l.intercept).toBeCloseTo(5);
  });
  it('point in polygon', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, sq)).toBe(false);
  });
});

describe('calibration', () => {
  it('derives 0.5 mm/px from a 23.4 px iris', () => {
    expect(mmPerPx(face)).toBeCloseTo(IRIS_DIAMETER_MM / 23.4, 6);
    expect(mmPerPx(face)).toBeCloseTo(0.5, 6);
  });
  it('detects and corrects roll', () => {
    const r = rotated(face, 5);
    expect(rollDeg(r)).toBeCloseTo(5, 6);
    expect(rollDeg(rollCorrect(r))).toBeCloseTo(0, 6);
  });
  it('returns null mm scale without iris points (468-point model)', () => {
    expect(mmPerPx(face.slice(0, 468))).toBeNull();
  });
});

describe('frontal metrics — exact values on the synthetic face', () => {
  it('thirds and lower face', () => {
    expect(thirdsMiddleToLower(face)).toBeCloseTo(1, 6);
    expect(lowerFaceRatio(face)).toBeCloseTo(61 / 139, 6);
  });
  it('fifths, intercanthal, nose, face shape', () => {
    // eye width = hypot(60, 6)
    const ew = Math.hypot(60, 6);
    const segs = fifths(face);
    expect(segs).toHaveLength(5);
    expect(segs[2]).toBeCloseTo(60 / ew, 6);
    expect(intercanthalRatio(face)).toBeCloseTo(60 / ew, 6);
    expect(noseWidthRatio(face)).toBeCloseTo(1, 6);
    expect(bizygomaticToBigonial(face)).toBeCloseTo(300 / 240, 6);
  });
  it('canthal tilt is positive when the outer corner is higher', () => {
    expect(canthalTilt(face, 'R')).toBeCloseTo(tilt, 6);
    expect(canthalTilt(face, 'L')).toBeCloseTo(tilt, 6);
  });
  it('lips and mouth', () => {
    expect(lipsUpperToLower(face)).toBeCloseTo(20 / 32, 6);
    expect(mouthWidthRatio(face)).toBeCloseTo(96 / (120 - 23.4), 6);
  });
  it('brow height and symmetry', () => {
    expect(browHeightMm(face, 'R', 0.5)).toBeCloseTo(25, 6);
    expect(browHeightMm(face, 'L', 0.5)).toBeCloseTo(25, 6);
    for (const r of ['brows', 'eyes', 'cheeks', 'mouth', 'jaw'] as const) expect(symmetryPercent(face, r)).toBeCloseTo(0, 6);
  });
  it('detects a known asymmetry', () => {
    const asym = face.map((p, i) => (i === 61 ? { x: p.x - 10, y: p.y } : p)); // R mouth corner 10 px further out
    // dR = 58, dL = 48 → |58 − 48| / 53 = 18.87 %
    expect(symmetryPercent(asym, 'mouth')).toBeCloseTo((10 / 53) * 100, 4);
  });
});

describe('roll-corrected metrics are invariant to a 5° head tilt', () => {
  const tiltedFindings = frontalFindings(rotated(face, 5));
  const straight = frontalFindings(face);
  it.each(straight.map((f) => f.key))('%s', (key) => {
    const a = straight.find((f) => f.key === key)!.value!;
    const b = tiltedFindings.find((f) => f.key === key)!.value!;
    expect(b).toBeCloseTo(a, 4);
  });
});

describe('edge case: missing iris', () => {
  it('hides mm values but keeps ratios', () => {
    const f = frontalFindings(face.slice(0, 468));
    expect(f.find((x) => x.key === 'brow.asymmetry')).toBeUndefined();
    expect(f.find((x) => x.key === 'mouth.width')!.value).toBeNull();
    expect(f.find((x) => x.key === 'thirds.middleToLower')!.value).toBeCloseTo(1, 6);
  });
});

describe('severity', () => {
  it('maps deviation to 0–4', () => {
    expect([0.2, 0.7, 1.2, 1.7, 2.5].map(severityFromDeviation)).toEqual([0, 1, 2, 3, 4]);
  });
  it('measures deviation from a range edge', () => {
    expect(deviation(6, NORMS['canthalTilt.R'])).toBe(0);
    expect(deviation(1, NORMS['canthalTilt.R'])).toBeCloseTo(1, 6);
    expect(deviation(1.2, NORMS['faceShape.bizygomaticToBigonial'])).toBeNull();
  });
  it('grades from thresholds', () => {
    expect(gradeFromThresholds(0.01, [0.1, 0.2, 0.3, 0.4])).toBe(0);
    expect(gradeFromThresholds(0.25, [0.1, 0.2, 0.3, 0.4])).toBe(2);
    expect(gradeFromThresholds(9, [0.1, 0.2, 0.3, 0.4])).toBe(4);
  });
  it('synthetic face: ideal thirds and lips have severity 0', () => {
    const f = frontalFindings(face);
    expect(f.find((x) => x.key === 'thirds.middleToLower')!.severity).toBe(0);
    expect(f.find((x) => x.key === 'lips.upperToLower')!.severity).toBe(0);
    expect(f.find((x) => x.key === 'canthalTilt.R')!.severity).toBe(0);
  });
});

describe('pose', () => {
  it('round-trips Euler angles through the transformation matrix', () => {
    const pose = { yaw: 30, pitch: -10, roll: 5 };
    const back = poseFromMatrix(matrixFromPose(pose));
    expect(back.yaw).toBeCloseTo(30, 6);
    expect(back.pitch).toBeCloseTo(-10, 6);
    expect(back.roll).toBeCloseTo(5, 6);
  });
});

describe('proxies', () => {
  it('relative darkness', () => {
    expect(relativeDarkness(80, 100)).toBeCloseTo(0.2);
    expect(relativeDarkness(120, 100)).toBe(0);
    expect(discLuminance(() => 50, { x: 0, y: 0 }, 5)).toBe(50);
  });
  it('uniform image → no tear-trough darkness', () => {
    expect(tearTroughDarkness(face, () => 150)).toBeCloseTo(0, 6);
  });
  it('darker band under the eyes → positive darkness', () => {
    const sample = (_x: number, y: number) => (y > 415 && y < 445 ? 100 : 160);
    expect(tearTroughDarkness(face, sample)).toBeGreaterThan(0.3);
    const s = proxySuggestions(face, sample).find((x) => x.key === 'teartrough')!;
    expect(s.severity).toBe(4);
    expect(s.confidence).toBeLessThan(0.5);
  });
  it('lip deficiency is computed from geometry', () => {
    // red-lip height (54 − 2) / mouth width 96 = 0.5417 > reference → 0
    expect(lipDeficiency(face)).toBe(0);
  });
});

describe('findings', () => {
  it('builds metric + graded findings and merges plan severities', () => {
    const f = buildFindings(face, () => 150);
    expect(f.some((x) => x.source === 'clinician' && x.key === 'midface.volume' && x.confidence === 'manual')).toBe(true);
    const graded = f.map((x) => (x.key === 'jowl' ? { ...x, severity: 3 as const } : x));
    const sev = planSeverities(graded);
    expect(sev['jowl']).toBe(3);
    const rejected = graded.map((x) => (x.key === 'jowl' ? { ...x, status: 'rejected' as const } : x));
    expect(planSeverities(rejected)['jowl']).toBeUndefined();
  });
  it('age bands', () => {
    expect([18, 29, 30, 45, 59, 60, 80].map(ageBandOf)).toEqual(['18-29', '18-29', '30-39', '40-49', '50-59', '60+', '60+']);
  });
});
