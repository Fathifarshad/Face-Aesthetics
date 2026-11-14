import { CONCERN_IDS, type ConcernId } from '../data/types';
import { compose, decompose, newAttenuation, SMOOTH_COEFFICIENTS, type Attenuation, type Decomposition, type SmoothType } from './bands';
import { toPx } from './faceFrame';
import { detectHairline } from './hairline';
import { ANCHOR } from './landmarks';
import { buildMask, limitMask, stampMax, type Mask } from './masks';
import { buildRegions } from './regions';
import type { Pt } from './types';

/** PRD F3.2: no effect is applied above 85 %, so the picture never looks artificial. */
export const MAX_INTENSITY = 0.85;

/** Soft edge of region masks, in face units. Source: SUPERPROMPT (0.02). */
const FEATHER = 0.02;
/** Protected regions get a tighter edge so they stay sharp right up to their border. */
const PROTECT_FEATHER = 0.008;
/** Margin of the working box around the regions, in face units. */
const BOX_MARGIN = 0.25;

/**
 * Smoothing applied for each concern: the type from the PRD §5.4 table where the table names the concern
 * (forehead, glabella, crow's feet, perioral = fine; nasolabial, marionette = deep; under-eye, temple = hollow).
 * Chin, neck and skin are not in that table: chin and neck use `fine`, skin uses a gentle `fine`
 * (PRD §6: "S, mild, whole face"). Concerns whose effect is a shape change get no smoothing; they come with M4.
 */
export const SMOOTHING: Record<ConcernId, { type: SmoothType; scale: number } | null> = {
  'forehead-lines': { type: 'fine', scale: 1 },
  'glabellar-lines': { type: 'fine', scale: 1 },
  'crows-feet': { type: 'fine', scale: 1 },
  'tear-trough': { type: 'hollow', scale: 1 },
  'midface-volume': null,
  'nasolabial-fold': { type: 'deep', scale: 1 },
  marionette: { type: 'deep', scale: 1 },
  'lip-volume': null,
  'perioral-lines': { type: 'fine', scale: 1 },
  chin: { type: 'fine', scale: 1 },
  jawline: null,
  masseter: null,
  temple: { type: 'hollow', scale: 1 },
  brow: null,
  neck: { type: 'fine', scale: 1 },
  'skin-quality': { type: 'fine', scale: 0.5 },
};

export interface Change {
  concernId: ConcernId;
  /** 0…1; values above MAX_INTENSITY are capped. */
  intensity: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Everything computed once per photo: the working box, its layers and one mask per region. */
export interface Prepared {
  /** Working box inside the photo; rendered pixels cover exactly this box. */
  rect: Rect;
  dec: Decomposition;
  masks: Partial<Record<ConcernId, Mask[]>>;
  /** Concerns that have a smoothing effect and a region on this photo. */
  available: ConcernId[];
  att: Attenuation;
}

export interface PipelineInput {
  /** RGBA pixels of the working copy of the photo. */
  data: Uint8ClampedArray;
  width: number;
  height: number;
  /** Landmarks in pixels of that working copy. */
  landmarks: readonly Pt[];
}

/** One-time work for a photo: regions, the working box around the face, blurred layers and soft masks. */
export function prepare(input: PipelineInput): Prepared {
  const { data, width, height, landmarks } = input;
  const hairline = detectHairline({ data, width, height }, landmarks);
  const set = buildRegions(landmarks, { size: { width, height }, hairline });
  const unit = set.frame.unit;
  const px = (q: Pt) => toPx(set.frame, q);

  // Working box: every region plus a margin, clipped to the photo.
  const all = set.regions.flatMap((r) => r.outline.map(px));
  const margin = BOX_MARGIN * unit;
  const x = Math.max(0, Math.floor(Math.min(...all.map((p) => p.x)) - margin));
  const y = Math.max(0, Math.floor(Math.min(...all.map((p) => p.y)) - margin));
  const x1 = Math.min(width, Math.ceil(Math.max(...all.map((p) => p.x)) + margin));
  const y1 = Math.min(height, Math.ceil(Math.max(...all.map((p) => p.y)) + margin));
  const rect: Rect = { x, y, width: x1 - x, height: y1 - y };
  const local = (q: Pt): Pt => {
    const p = px(q);
    return { x: p.x - rect.x, y: p.y - rect.y };
  };

  const crop = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (let row = 0; row < rect.height; row++) {
    const from = ((rect.y + row) * width + rect.x) * 4;
    crop.set(data.subarray(from, from + rect.width * 4), row * rect.width * 4);
  }
  const faceWidth = Math.hypot(landmarks[ANCHOR.lFaceEdge]!.x - landmarks[ANCHOR.rFaceEdge]!.x, landmarks[ANCHOR.lFaceEdge]!.y - landmarks[ANCHOR.rFaceEdge]!.y);
  const dec = decompose(crop, rect.width, rect.height, faceWidth);

  // Smoothing never touches protected regions and never leaves the face.
  const pixels = rect.width * rect.height;
  const protect = new Float32Array(pixels);
  for (const r of set.regions) if (r.protect) stampMax(protect, rect.width, buildMask(r.outline.map(local), rect, PROTECT_FEATHER * unit));
  const face = new Float32Array(pixels);
  const skin = set.regions.find((r) => r.concernId === 'skin-quality');
  if (skin) stampMax(face, rect.width, buildMask(skin.outline.map(local), rect, FEATHER * unit));

  const masks: Prepared['masks'] = {};
  for (const r of set.regions) {
    if (!r.concernId || !SMOOTHING[r.concernId]) continue;
    const mask = buildMask(r.outline.map(local), rect, FEATHER * unit);
    // The neck lies outside the face outline by definition; everything else is clipped to it.
    limitMask(mask, rect.width, r.concernId === 'neck' ? null : face, protect);
    (masks[r.concernId] ??= []).push(mask);
  }

  return { rect, dec, masks, available: CONCERN_IDS.filter((id) => masks[id]?.length), att: newAttenuation(pixels) };
}

/**
 * Renders the working box with the given changes. Fast path for slider moves: only the attenuation maps and
 * the final mix are recomputed, and only inside the boxes of the active regions.
 * Returns new RGBA pixels of `prepared.rect`.
 */
export function render(prepared: Prepared, changes: readonly Change[]): Uint8ClampedArray {
  const { dec, att, masks } = prepared;
  const w = dec.width;
  const out = new Uint8ClampedArray(dec.src);
  let bx0 = w;
  let by0 = dec.height;
  let bx1 = 0;
  let by1 = 0;
  const active: { mask: Mask; fine: number; band1: number; band2: number; band3: number }[] = [];
  for (const change of changes) {
    const effect = SMOOTHING[change.concernId];
    const k = Math.min(MAX_INTENSITY, Math.max(0, change.intensity)) * (effect?.scale ?? 0);
    if (!effect || k <= 0) continue;
    const c = SMOOTH_COEFFICIENTS[effect.type];
    for (const mask of masks[change.concernId] ?? []) {
      active.push({ mask, fine: c.fine * k, band1: c.band1 * k, band2: c.band2 * k, band3: c.band3 * k });
      bx0 = Math.min(bx0, mask.x);
      by0 = Math.min(by0, mask.y);
      bx1 = Math.max(bx1, mask.x + mask.width);
      by1 = Math.max(by1, mask.y + mask.height);
    }
  }
  if (active.length === 0) return out;

  for (let row = by0; row < by1; row++) {
    att.fine.fill(0, row * w + bx0, row * w + bx1);
    att.band1.fill(0, row * w + bx0, row * w + bx1);
    att.band2.fill(0, row * w + bx0, row * w + bx1);
    att.band3.fill(0, row * w + bx0, row * w + bx1);
  }
  // Overlapping regions combine like independent filters: 1 − (1 − a)(1 − b).
  for (const { mask, fine, band1, band2, band3 } of active) {
    for (let row = 0; row < mask.height; row++) {
      const o = (mask.y + row) * w + mask.x;
      for (let col = 0; col < mask.width; col++) {
        const m = mask.data[row * mask.width + col]!;
        if (m <= 0) continue;
        const i = o + col;
        att.fine[i] = 1 - (1 - att.fine[i]!) * (1 - m * fine);
        att.band1[i] = 1 - (1 - att.band1[i]!) * (1 - m * band1);
        att.band2[i] = 1 - (1 - att.band2[i]!) * (1 - m * band2);
        att.band3[i] = 1 - (1 - att.band3[i]!) * (1 - m * band3);
      }
    }
  }
  compose(dec, att, out, bx0, by0, bx1, by1);
  return out;
}
