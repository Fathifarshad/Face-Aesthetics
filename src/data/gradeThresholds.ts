/**
 * Index → grade boundaries of the automatic grading (docs/PRD.md F2.2, F2.3; index defined in
 * src/engine/grading.ts). PRD §6–7 give no numbers for this mapping. The values below were set by Claude on the
 * project's own test photos so that the suggested grades look plausible; they are not from any study and must be
 * calibrated by a senior physician on graded photos before clinical use. Every grade is only a suggestion that
 * the doctor confirms, edits or rejects (F2.4).
 * Pure data: no React, no DOM.
 */
import type { Confidence, ConcernId, Grade, Status } from './types';

export interface GradeThresholds {
  /** Lower bounds of grades 1, 2, 3 and 4, ascending. */
  bounds: readonly [number, number, number, number];
  /**
   * Highest confidence a suggestion may claim. On the test photos only the under-eye hollow and the marionette
   * lines ranked the faces in the expected order (both older faces above both young ones); for the others,
   * lighting, a smile, hair or clothing weighed more than the concern itself, so they stay "low" until calibrated.
   */
  maxConfidence: Confidence;
  status: Status;
  source: string;
}

const SOURCE =
  'Set by Claude on 6 test photos of 5 people (test-assets/, 2026-11-15; indices in test-results/grading/); not from a study';

const draft = (bounds: GradeThresholds['bounds'], maxConfidence: Confidence): GradeThresholds => ({
  bounds,
  maxConfidence,
  status: 'draft', // TODO(clinical): calibrate on photos graded by a senior physician
  source: SOURCE,
});

/**
 * Only the concerns in AUTO_GRADED (src/data/concerns.ts) have thresholds. Indices are the shadow contrast of
 * the region in percent of the cheek brightness; skin quality is the fine-texture contrast in percent.
 */
export const GRADE_THRESHOLDS: Partial<Record<ConcernId, GradeThresholds>> = {
  'tear-trough': draft([3, 5, 6.5, 9], 'mid'),
  marionette: draft([4, 6, 8.5, 13], 'mid'),
  'nasolabial-fold': draft([4, 6, 9, 13], 'low'),
  'crows-feet': draft([5, 8, 11, 14], 'low'),
  'glabellar-lines': draft([5, 8, 11, 14], 'low'),
  'forehead-lines': draft([1.5, 2.5, 3.5, 4.5], 'low'),
  'perioral-lines': draft([6, 9, 13, 18], 'low'),
  neck: draft([9, 11, 14, 18], 'low'),
  'skin-quality': draft([4.5, 5.5, 6.5, 8], 'low'),
};

/** Grade of an index: the number of boundaries it reaches. */
export function gradeFromIndex(index: number, bounds: GradeThresholds['bounds']): Grade {
  let g = 0;
  for (const b of bounds) if (index >= b) g++;
  return g as Grade;
}
