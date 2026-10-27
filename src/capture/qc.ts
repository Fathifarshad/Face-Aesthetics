import type { Pose } from '../analysis/types';
import type { ViewDef } from './views';

/**
 * Quality-check thresholds (docs/ANALYSIS_SPEC.md §2). Blur and backlight values are placeholders
 * to be tuned on test photos.
 */
export const QC_THRESHOLDS = {
  faceHeight: [0.45, 0.65] as const,
  luminance: [90, 200] as const,
  cheekDiff: 0.2,
  /** Variance of the Laplacian on the downscaled grey face crop. TODO: calibrate. */
  blurMin: 30,
  /** Background / face luminance ratio above which we flag backlight. TODO: calibrate. */
  backlightMax: 1.45,
};

export type QcInput = {
  faces: number;
  pose: Pose | null;
  faceHeightRatio: number | null;
  faceLum: number | null;
  cheekDiff: number | null;
  blur: number | null;
  backlight: number | null;
};

export type QcCheckId = 'single-face' | 'pose' | 'size' | 'exposure' | 'even-light' | 'sharpness' | 'backlight';
/** pass === null → not measurable for this view (e.g. landmarks unavailable on a profile). */
export type QcCheck = { id: QcCheckId; pass: boolean | null; value?: string; hint?: string };
export type QcResult = { checks: QcCheck[]; pass: boolean };

const within = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;

export function evaluateQc(input: QcInput, view: ViewDef): QcResult {
  const checks: QcCheck[] = [];
  const detected = input.faces > 0;
  checks.push({
    id: 'single-face',
    pass: input.faces === 1 ? true : view.manualAllowed && input.faces === 0 ? null : false,
    value: String(input.faces),
    hint: input.faces === 0 ? 'no-face' : input.faces > 1 ? 'many-faces' : undefined,
  });

  if (input.pose && detected) {
    const yawErr = Math.abs(Math.abs(input.pose.yaw) - view.yaw);
    const pitchOk = Math.abs(input.pose.pitch) <= Math.max(view.tolerance, 8) || view.id === 'submental';
    const rollOk = Math.abs(input.pose.roll) <= view.tolerance + 2;
    const pass = yawErr <= view.tolerance && pitchOk && rollOk;
    checks.push({
      id: 'pose',
      pass,
      value: `yaw ${input.pose.yaw.toFixed(0)}° · pitch ${input.pose.pitch.toFixed(0)}° · roll ${input.pose.roll.toFixed(0)}°`,
      hint: pass
        ? undefined
        : !rollOk
          ? 'level-head'
          : yawErr > view.tolerance
            ? Math.abs(input.pose.yaw) < view.yaw
              ? 'turn-more'
              : 'turn-less'
            : 'chin-level',
    });
  } else {
    checks.push({ id: 'pose', pass: view.manualAllowed ? null : false, hint: 'no-face' });
  }

  if (view.frontal && input.faceHeightRatio !== null) {
    const pass = within(input.faceHeightRatio, QC_THRESHOLDS.faceHeight);
    checks.push({
      id: 'size',
      pass,
      value: `${Math.round(input.faceHeightRatio * 100)}%`,
      hint: pass ? undefined : input.faceHeightRatio < QC_THRESHOLDS.faceHeight[0] ? 'move-closer' : 'move-back',
    });
  }

  if (input.faceLum !== null) {
    const pass = within(input.faceLum, QC_THRESHOLDS.luminance);
    checks.push({
      id: 'exposure',
      pass,
      value: input.faceLum.toFixed(0),
      hint: pass ? undefined : input.faceLum < QC_THRESHOLDS.luminance[0] ? 'more-light' : 'less-light',
    });
  }
  if (input.cheekDiff !== null && view.frontal) {
    const pass = input.cheekDiff < QC_THRESHOLDS.cheekDiff;
    checks.push({ id: 'even-light', pass, value: `${Math.round(input.cheekDiff * 100)}%`, hint: pass ? undefined : 'face-window' });
  }
  if (input.blur !== null) {
    const pass = input.blur >= QC_THRESHOLDS.blurMin;
    checks.push({ id: 'sharpness', pass, value: input.blur.toFixed(0), hint: pass ? undefined : 'hold-still' });
  }
  if (input.backlight !== null) {
    const pass = input.backlight <= QC_THRESHOLDS.backlightMax;
    checks.push({ id: 'backlight', pass, value: input.backlight.toFixed(2), hint: pass ? undefined : 'no-backlight' });
  }

  return { checks, pass: checks.every((c) => c.pass !== false) };
}
