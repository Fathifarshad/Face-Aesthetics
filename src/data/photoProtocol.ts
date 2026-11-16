/**
 * When to take the "after" photos (PRD §8, «زمان عکس بعد»). Pure data: no React, no DOM.
 *
 * PRD §8 says research found no standard source; these are common practice and the clinic adapts them.
 * Modalities PRD §8 does not name get no time: the doctor sets the follow-up.
 */
import type { Modality } from './treatmentOptions';
import type { Status } from './types';

export interface AfterPhotoTiming {
  /** Earliest and latest day after treatment for the "after" photo set. */
  minDays: number;
  maxDays: number;
  status: Status;
  source: string;
}

const SOURCE = 'docs/PRD.md §8 (draft: common clinical photography practice)';
// TODO(clinical): PRD §8 timings are a draft until the clinic's photography protocol confirms them.
const at = (minDays: number, maxDays = minDays): AfterPhotoTiming => ({ minDays, maxDays, status: 'draft', source: SOURCE });

const DEVICE = at(90); // «بیواستیمولاتور و دستگاه 3 ماه»

export const AFTER_PHOTO_TIMING: Record<Modality, AfterPhotoTiming | null> = {
  toxin: at(14), // 2 weeks
  filler: at(14, 28), // 2–4 weeks
  thread: at(28), // 4 weeks
  biostimulator: DEVICE,
  'rf-microneedling': DEVICE,
  hifu: DEVICE,
  laser: DEVICE,
  skinbooster: null,
  polynucleotide: null,
  peel: null,
};

const DAY = 24 * 60 * 60 * 1000;

/** Window for the "after" photos of one modality, counted from the treatment (here: the "before" photo) date. */
export function afterPhotoWindow(modality: Modality, from: number): { from: number; to: number; timing: AfterPhotoTiming } | null {
  const timing = AFTER_PHOTO_TIMING[modality];
  return timing ? { from: from + timing.minDays * DAY, to: from + timing.maxDays * DAY, timing } : null;
}
