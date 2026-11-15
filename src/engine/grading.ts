import { AUTO_GRADED } from '../data/concerns';
import { GRADE_THRESHOLDS, gradeFromIndex } from '../data/gradeThresholds';
import type { Confidence, ConcernId, FindingSide, Grade } from '../data/types';
import type { Decomposition } from './bands';
import type { Prepared } from './pipeline';
import { SMOOTHING } from './pipeline';

/**
 * Automatic grading (docs/PRD.md F2.2, F2.3). For a line, fold or hollow the visible sign is its shadow, so the
 * index is the shadow energy of the region in percent of the cheek brightness of the same photo (PRD F2.3 names
 * the cheek as the reference skin):
 *
 *   E(region) = √( Σ w · min(0, b)² / Σ w )      b = luma of the bands that carry this kind of shadow
 *   index     = 100 · E(region) / median luma(cheeks)
 *
 * Dividing by the cheek brightness removes most of the effect of exposure. A first version divided by the
 * shadow energy of the cheeks instead; on a young face with very smooth cheeks that made every ratio large
 * (grade 4 folds on a 25-year-old), so it was dropped. The index is still approximate and sensitive to side
 * lighting (PRD §14). Skin quality has no shadow: its index is the contrast of the fine texture over the whole face.
 * The mapping index → grade is clinical calibration and lives in src/data/gradeThresholds.ts.
 */

/** Bands measured per smoothing type: lines sit in band1+2, folds in band2+3, hollows in band3+4 (bands.ts). */
const BANDS = {
  fine: ['lp1', 'lp3'],
  deep: ['lp2', 'lp4'],
  hollow: ['lp3', 'lp5'],
} as const satisfies Record<string, readonly [keyof Decomposition, keyof Decomposition]>;


/** Quality limits for a confident grade. Engine settings, not clinical values. */
export const QUALITY = {
  /** Head turn and nod (degrees) above which shading on one side is not comparable with the other. */
  maxYaw: 8,
  maxPitch: 10,
  /** Cheek brightness outside this range = under- or overexposed photo. */
  minLuma: 60,
  maxLuma: 230,
  /** Region smaller than a square of this side (face units) is too small to measure. */
  minRegion: 0.08,
  /** Index within this ratio of a grade boundary (|ln(index / boundary)|) is "mid" rather than "high". */
  nearBoundary: 0.12,
} as const;

export interface Measurement {
  concernId: ConcernId;
  side: FindingSide;
  index: number;
  /** Measured area, in square face units. */
  area: number;
}

export interface AutoGrade {
  concernId: ConcernId;
  side: FindingSide;
  index: number;
  autoGrade: Grade;
  confidence: Confidence;
}

const RANK: Record<Confidence, number> = { low: 0, mid: 1, high: 2 };

export type Pose = { yaw: number; pitch: number; roll: number };

const luma = (rgb: Uint8ClampedArray, i: number) => 0.299 * rgb[i]! + 0.587 * rgb[i + 1]! + 0.114 * rgb[i + 2]!;

/** Shadow energy of `hi − lo` over a weight map of the whole working box, inside the box [x0, x1) × [y0, y1). */
function shadowEnergy(dec: Decomposition, hi: Uint8ClampedArray, lo: Uint8ClampedArray, weight: (i: number) => number, box: Box): { e: number; w: number } {
  let sum = 0;
  let total = 0;
  for (let y = box.y0; y < box.y1; y++)
    for (let x = box.x0; x < box.x1; x++) {
      const i = y * dec.width + x;
      const w = weight(i);
      if (w <= 0) continue;
      const b = luma(hi, i * 3) - luma(lo, i * 3);
      if (b < 0) sum += w * b * b;
      total += w;
    }
  return { e: total > 0 ? Math.sqrt(sum / total) : 0, w: total };
}

type Box = { x0: number; y0: number; x1: number; y1: number };

/** Raw indices of every auto-graded concern found on this photo, one per side. */
export function measure(prepared: Prepared): Measurement[] {
  const { dec, masks, skin, frame } = prepared;
  const unit2 = frame.unit * frame.unit;
  const out: Measurement[] = [];
  const level = Math.max(1, prepared.cheekLuma ?? 128);

  for (const concernId of AUTO_GRADED) {
    const effect = SMOOTHING[concernId];
    const regions = masks[concernId];
    if (!effect || !regions?.length) continue;
    for (const { side, mask } of regions) {
      const box = { x0: mask.x, y0: mask.y, x1: mask.x + mask.width, y1: mask.y + mask.height };
      const weight = (i: number) => {
        const x = (i % dec.width) - mask.x;
        const y = Math.floor(i / dec.width) - mask.y;
        return mask.data[y * mask.width + x]!;
      };
      const findingSide: FindingSide = side === 'M' ? 'both' : side;
      if (concernId === 'skin-quality') {
        out.push({ concernId, side: findingSide, ...textureIndex(prepared, box, (i) => weight(i) * skin[i]!) });
        continue;
      }
      const [hi, lo] = BANDS[effect.type];
      const { e, w } = shadowEnergy(dec, dec[hi], dec[lo], weight, box);
      out.push({ concernId, side: findingSide, index: (100 * e) / level, area: w / unit2 });
    }
  }
  return out;
}

/** Fine-texture contrast (src − LP2, both signs) in percent of the cheek brightness. */
function textureIndex(prepared: Prepared, box: Box, weight: (i: number) => number): { index: number; area: number } {
  const { dec, cheekLuma, frame } = prepared;
  let sum = 0;
  let total = 0;
  for (let y = box.y0; y < box.y1; y++)
    for (let x = box.x0; x < box.x1; x++) {
      const i = y * dec.width + x;
      const w = weight(i);
      if (w <= 0) continue;
      const b = luma(dec.src, i * 4) - luma(dec.lp2, i * 3);
      sum += w * b * b;
      total += w;
    }
  const level = Math.max(1, cheekLuma ?? 128);
  return { index: total > 0 ? (Math.sqrt(sum / total) / level) * 100 : 0, area: total / (frame.unit * frame.unit) };
}

/** Problems with the photo that make every automatic grade unreliable. */
export function photoProblems(prepared: Prepared, pose: Pose | null): ('pose' | 'exposure' | 'no-reference')[] {
  const problems: ('pose' | 'exposure' | 'no-reference')[] = [];
  if (pose && (Math.abs(pose.yaw) > QUALITY.maxYaw || Math.abs(pose.pitch) > QUALITY.maxPitch)) problems.push('pose');
  const l = prepared.cheekLuma;
  if (l === null) problems.push('no-reference');
  else if (l < QUALITY.minLuma || l > QUALITY.maxLuma) problems.push('exposure');
  return problems;
}

/** Grade and confidence of each measurement (PRD F2.2). */
export function grade(measurements: readonly Measurement[], problems: readonly string[]): AutoGrade[] {
  return measurements.map((m) => {
    const t = GRADE_THRESHOLDS[m.concernId];
    const autoGrade = t ? gradeFromIndex(m.index, t.bounds) : 0;
    let confidence: Confidence = 'high';
    if (!t || problems.length > 0 || m.area < QUALITY.minRegion ** 2) confidence = 'low';
    else if (t.bounds.some((b) => Math.abs(Math.log(m.index / b)) < QUALITY.nearBoundary)) confidence = 'mid';
    if (t && RANK[confidence] > RANK[t.maxConfidence]) confidence = t.maxConfidence;
    return { concernId: m.concernId, side: m.side, index: m.index, autoGrade, confidence };
  });
}
