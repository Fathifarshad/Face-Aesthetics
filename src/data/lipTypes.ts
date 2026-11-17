/**
 * Lip types 1 (very thin) … 5 (very full), owner request 2026-11-15: the lip change must suit the lip type, as a
 * lip designer would. The type is suggested from the photo (lip fullness = total lip height at the middle ÷ mouth
 * width, src/engine/warp.ts `lipFullness`) and the doctor can change it. A thinner type gets a larger share of the
 * lip operator's full strength; a very full lip is changed only a little.
 * These are aesthetic-design values set by Claude, not clinical numbers: draft until the owner confirms them.
 * Pure data: no React, no DOM.
 */
import { REVIEWED } from './clinicalReview';
import type { Status } from './types';

export type LipType = 1 | 2 | 3 | 4 | 5;
export const LIP_TYPES: readonly LipType[] = [1, 2, 3, 4, 5];

export const LIP_TYPE_SETTINGS: {
  /** Lower fullness bounds of types 2, 3, 4 and 5. */
  bounds: readonly [number, number, number, number];
  /** Share of the lip operator's full strength per type. */
  gain: Record<LipType, number>;
  status: Status;
  source: string;
} = {
  bounds: [0.24, 0.3, 0.36, 0.42],
  gain: { 1: 1, 2: 0.8, 3: 0.6, 4: 0.4, 5: 0.2 },
  status: 'verified',
  source: `Set by Claude (aesthetic design) on the test photos, 2026-11-15; ${REVIEWED}`,
};

/** Suggested type of a measured fullness. */
export function lipTypeOf(fullness: number): LipType {
  let t = 1;
  for (const b of LIP_TYPE_SETTINGS.bounds) if (fullness >= b) t++;
  return t as LipType;
}
