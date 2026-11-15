import { SAFETY_CEILING } from '../data/ageNorms';
import { CONCERN_IDS, type ConcernId } from '../data/types';
import { compose, decompose, newAttenuation, SMOOTH_COEFFICIENTS, type Attenuation, type Decomposition, type SmoothType } from './bands';
import { toFace, toPx } from './faceFrame';
import { hairMap, medianLuma } from './hair';
import { detectHairline } from './hairline';
import { ANCHOR } from './landmarks';
import { buildMask, limitMask, stampMax, type Mask } from './masks';
import { buildRegions, type Side } from './regions';
import { centroid } from './shapes';
import type { FaceFrame, Pt } from './types';
import { addOperator, applyField, buildOperators, lipFullness, MAX_SHIFT, newField, placeOperators, type Field, type PlacedOperator, type Sex } from './warp';

/** PRD F3.2: no effect is applied above 85 %, so the picture never looks artificial. */
export const MAX_INTENSITY = SAFETY_CEILING;

/** Soft edge of region masks, in face units. Source: SUPERPROMPT (0.02). */
const FEATHER = 0.02;
/**
 * Folds and hollows: the shadow reaches past the drawn outline, so their effect fades out over a wider edge and
 * is at full strength already on the outline (gain 2 on a mask that is 0.5 there). The outlines themselves are
 * the ones the owner approved in M1; only the fall-off outside them is wider.
 */
const SHADOW_FEATHER = 0.04;
const SHADOW_GAIN = 2;
/** Protected regions get a tighter edge so they stay sharp right up to their border. */
const PROTECT_FEATHER = 0.008;
/** Margin of the working box around the regions, in face units. */
const BOX_MARGIN = 0.25;
/** Hair detection: neighbourhood of the majority vote and width of the soft edge, in face units. */
const HAIR_GRAIN = 0.012;
const HAIR_FEATHER = 0.01;
/** Hair patches smaller than a square of this side (face units) are wrinkles, not hair. */
const HAIR_MIN_SIZE = 0.06;
/**
 * The warp never moves the eyes: the cheek lift and the brow-tail lift reached the eyelids and changed the shape of
 * the eye (owner review 2026-11-15). The displacement fades out over a soft margin around each eye: the eye outline
 * grown by these factors about its centre, with a soft edge wide enough (face units) that the fade itself cannot
 * fold the picture.
 */
const EYE_STILL = { grow: { x: 1.35, y: 2 }, feather: 0.08 } as const;

/**
 * Smoothing applied for each concern: the type from the PRD §5.4 table where the table names the concern
 * (forehead, glabella, crow's feet, perioral = fine; nasolabial, marionette = deep; under-eye, temple = hollow).
 * Chin, neck and skin are not in that table: chin and neck use `fine`, skin uses a gentle `fine`
 * (PRD §6: "S, mild, whole face"). Concerns whose effect is only a shape change get no smoothing;
 * their warp operators are in warp.ts (M4).
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
  /** 0…1; values above MAX_INTENSITY are capped. Applies to both sides unless `left` is given. */
  intensity: number;
  /** Strength of the subject's left side when the sides are set apart (mirror off); `intensity` is then the right side. */
  left?: number;
}

/** Region outline in pixels of the working box, for drawing and for picking a region by touch. */
export interface Outline {
  concernId: ConcernId;
  side: Side;
  points: Pt[];
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
  masks: Partial<Record<ConcernId, { side: Side; mask: Mask }[]>>;
  /** Warp operators placed in the working box. */
  ops: PlacedOperator[];
  /** Face frame in pixels of the working copy (the box starts at rect.x, rect.y). */
  frame: FaceFrame;
  /** Concerns that have a smoothing or a warp effect and a region on this photo. */
  available: ConcernId[];
  /** Concerns with a right and a left region (they get the mirror switch). */
  bilateral: ConcernId[];
  outlines: Outline[];
  att: Attenuation;
  field: Field;
  /** Copy of the pixels the warp samples from; reused between renders. */
  scratch: Uint8ClampedArray;
  /** Last smoothing result and the strengths it was made with. */
  smoothed: { key: string; pixels: Uint8ClampedArray | null };
  /** Per-pixel skin weight: inside the face outline, outside protected regions and hair. Used by grading. */
  skin: Float32Array;
  /** Cheek skin (midface regions × skin weight): the reference the grading compares each region with. */
  cheek: Float32Array;
  /** Median brightness of the cheeks (0…255), or null when they could not be measured. */
  cheekLuma: number | null;
  /** Per-pixel factor of the warp displacement: 0 on the eyes, 1 away from them. */
  still: Float32Array;
  /** Lip height at the middle ÷ mouth width (suggests the lip type). */
  lipFullness: number;
}

export interface PipelineInput {
  /** RGBA pixels of the working copy of the photo. */
  data: Uint8ClampedArray;
  width: number;
  height: number;
  /** Landmarks in pixels of that working copy. */
  landmarks: readonly Pt[];
  /** Patient's sex; shapes the chin and jaw-angle operators. */
  sex?: Sex;
}

/** One-time work for a photo: regions, the working box around the face, blurred layers and soft masks. */
export function prepare(input: PipelineInput): Prepared {
  const { data, width, height, landmarks, sex } = input;
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

  // Smoothing never touches protected regions and never leaves the face.
  const pixels = rect.width * rect.height;
  const protect = new Float32Array(pixels);
  for (const r of set.regions) if (r.protect) stampMax(protect, rect.width, buildMask(r.outline.map(local), rect, PROTECT_FEATHER * unit));
  const face = new Float32Array(pixels);
  const skin = set.regions.find((r) => r.concernId === 'skin-quality');
  if (skin) stampMax(face, rect.width, buildMask(skin.outline.map(local), rect, FEATHER * unit));

  // Dark hair (moustache, beard, fringe) is protected like the eyes and lips. The reference skin is the cheeks.
  const cheeks = new Float32Array(pixels);
  for (const r of set.regions) if (r.concernId === 'midface-volume') stampMax(cheeks, rect.width, buildMask(r.outline.map(local), rect, 0));
  const reference = medianLuma(crop, cheeks);
  const hair = reference === null ? null : hairMap(crop, rect.width, rect.height, reference, HAIR_GRAIN * unit, HAIR_FEATHER * unit, cheeks, (HAIR_MIN_SIZE * unit) ** 2);
  if (hair) for (let i = 0; i < pixels; i++) protect[i] = Math.max(protect[i]!, hair[i]!);

  // Layers: low-passes average skin only (inside the face outline, outside eyes, brows, nostrils, lips and hair).
  const skinWeight = new Float32Array(pixels);
  for (let i = 0; i < pixels; i++) skinWeight[i] = face[i]! * (1 - protect[i]!);
  const dec = decompose(crop, rect.width, rect.height, faceWidth, skinWeight);

  const masks: Prepared['masks'] = {};
  for (const r of set.regions) {
    if (!r.concernId || !SMOOTHING[r.concernId]) continue;
    const broad = SMOOTHING[r.concernId]!.type !== 'fine';
    const mask = buildMask(r.outline.map(local), rect, (broad ? SHADOW_FEATHER : FEATHER) * unit);
    if (broad) for (let i = 0; i < mask.data.length; i++) mask.data[i] = Math.min(1, mask.data[i]! * SHADOW_GAIN);
    // The neck lies outside the face outline by definition; everything else is clipped to it.
    limitMask(mask, rect.width, r.concernId === 'neck' ? null : face, protect);
    (masks[r.concernId] ??= []).push({ side: r.side, mask });
  }

  // Where the warp may move the picture: everywhere except the eyes and a soft margin around them.
  const still = new Float32Array(pixels).fill(1);
  const eyes = new Float32Array(pixels);
  for (const r of set.regions) {
    if (r.protectId !== 'eye') continue;
    const c = centroid(r.outline);
    const grown = r.outline.map((q) => ({ x: c.x + (q.x - c.x) * EYE_STILL.grow.x, y: c.y + (q.y - c.y) * EYE_STILL.grow.y }));
    stampMax(eyes, rect.width, buildMask(grown.map(local), rect, EYE_STILL.feather * unit));
  }
  // Gain 2: completely still wherever the soft mask is at least half (inside the grown outline), fading outside it.
  for (let i = 0; i < pixels; i++) still[i] = 1 - Math.min(1, eyes[i]! * 2);

  const ops = placeOperators(buildOperators(set, landmarks, sex), set.frame, { x: rect.x, y: rect.y }, rect.width, rect.height);
  const available = CONCERN_IDS.filter((id) => masks[id]?.length || ops.some((o) => o.op.concernId === id));
  const outlines: Outline[] = set.regions
    .filter((r): r is typeof r & { concernId: ConcernId } => !!r.concernId && available.includes(r.concernId))
    .map((r) => ({ concernId: r.concernId, side: r.side, points: r.outline.map(local) }));
  const bilateral = available.filter((id) => outlines.some((o) => o.concernId === id && o.side === 'L'));
  return {
    rect,
    dec,
    masks,
    ops,
    frame: set.frame,
    available,
    bilateral,
    outlines,
    att: newAttenuation(pixels),
    field: newField(rect.width, rect.height),
    scratch: new Uint8ClampedArray(dec.src.length),
    smoothed: { key: '', pixels: null },
    skin: skinWeight,
    cheek: cheeks.map((v, i) => v * skinWeight[i]!),
    cheekLuma: reference,
    still,
    lipFullness: lipFullness((i) => toFace(set.frame, landmarks[i]!)),
  };
}

/** Strength of one side of a change, capped at MAX_INTENSITY. Midline regions follow the main slider. */
export function strengthOf(change: Change, side: Side): number {
  const v = side === 'L' && change.left !== undefined ? change.left : change.intensity;
  return Math.min(MAX_INTENSITY, Math.max(0, v));
}

/**
 * Renders the working box with the given changes. Fast path for slider moves: only the attenuation maps and
 * the final mix are recomputed, and only inside the boxes of the active regions.
 * Returns new RGBA pixels of `prepared.rect`. `warp: false` renders the smoothing alone (used by tests).
 */
export function render(prepared: Prepared, changes: readonly Change[], options: { warp?: boolean } = {}): Uint8ClampedArray {
  const { dec, masks } = prepared;
  const w = dec.width;
  let bx0 = w;
  let by0 = dec.height;
  let bx1 = 0;
  let by1 = 0;
  const active: Active[] = [];
  let key = '';
  for (const change of changes) {
    const effect = SMOOTHING[change.concernId];
    if (!effect) continue;
    const c = SMOOTH_COEFFICIENTS[effect.type];
    for (const { side, mask } of masks[change.concernId] ?? []) {
      const k = strengthOf(change, side) * effect.scale;
      if (k <= 0) continue;
      key += `${change.concernId}:${side}:${k};`;
      active.push({ mask, fine: c.fine * k, band1: c.band1 * k, band2: c.band2 * k, band3: c.band3 * k, band4: c.band4 * k });
      bx0 = Math.min(bx0, mask.x);
      by0 = Math.min(by0, mask.y);
      bx1 = Math.max(bx1, mask.x + mask.width);
      by1 = Math.max(by1, mask.y + mask.height);
    }
  }
  // A slider that only warps (lips, jaw, masseter, brow) leaves the smoothing as it was: reuse it.
  const cache = prepared.smoothed;
  let out: Uint8ClampedArray;
  if (cache.key === key && cache.pixels) out = new Uint8ClampedArray(cache.pixels);
  else {
    out = new Uint8ClampedArray(dec.src);
    if (active.length > 0) smooth(prepared, active, out, bx0, by0, bx1, by1);
    cache.key = key;
    cache.pixels = active.length > 0 ? new Uint8ClampedArray(out) : dec.src;
  }
  if (options.warp !== false) warp(prepared, changes, out);
  return out;
}

type Active = { mask: Mask; fine: number; band1: number; band2: number; band3: number; band4: number };

function smooth(prepared: Prepared, active: Active[], out: Uint8ClampedArray, bx0: number, by0: number, bx1: number, by1: number): void {
  const { dec, att } = prepared;
  const w = dec.width;
  for (let row = by0; row < by1; row++) {
    att.fine.fill(0, row * w + bx0, row * w + bx1);
    att.band1.fill(0, row * w + bx0, row * w + bx1);
    att.band2.fill(0, row * w + bx0, row * w + bx1);
    att.band3.fill(0, row * w + bx0, row * w + bx1);
    att.band4.fill(0, row * w + bx0, row * w + bx1);
  }
  // Overlapping regions combine like independent filters: 1 − (1 − a)(1 − b).
  for (const { mask, fine, band1, band2, band3, band4 } of active) {
    for (let row = 0; row < mask.height; row++) {
      const o = (mask.y + row) * w + mask.x;
      for (let col = 0; col < mask.width; col++) {
        const m = mask.data[row * mask.width + col]!;
        if (m <= 0) continue;
        const i = o + col;
        if (fine > 0) att.fine[i] = 1 - (1 - att.fine[i]!) * (1 - m * fine);
        att.band1[i] = 1 - (1 - att.band1[i]!) * (1 - m * band1);
        att.band2[i] = 1 - (1 - att.band2[i]!) * (1 - m * band2);
        att.band3[i] = 1 - (1 - att.band3[i]!) * (1 - m * band3);
        att.band4[i] = 1 - (1 - att.band4[i]!) * (1 - m * band4);
      }
    }
  }
  compose(dec, att, out, bx0, by0, bx1, by1);
}

/** Warps `out` in place with the operators of the active changes (after smoothing, as the SUPERPROMPT orders). */
function warp(prepared: Prepared, changes: readonly Change[], out: Uint8ClampedArray): void {
  const { ops, field, scratch } = prepared;
  const w = field.width;
  const active: { placed: PlacedOperator; k: number }[] = [];
  let x0 = w;
  let y0 = field.height;
  let x1 = 0;
  let y1 = 0;
  for (const change of changes) {
    for (const placed of ops) {
      if (placed.op.concernId !== change.concernId) continue;
      const k = strengthOf(change, placed.op.side);
      if (k <= 0 || placed.x1 <= placed.x0 || placed.y1 <= placed.y0) continue;
      active.push({ placed, k });
      x0 = Math.min(x0, placed.x0);
      y0 = Math.min(y0, placed.y0);
      x1 = Math.max(x1, placed.x1);
      y1 = Math.max(y1, placed.y1);
    }
  }
  if (active.length === 0) return;
  for (let row = y0; row < y1; row++) {
    field.dx.fill(0, row * w + x0, row * w + x1);
    field.dy.fill(0, row * w + x0, row * w + x1);
  }
  for (const { placed, k } of active) addOperator(field, placed, k);
  const { still } = prepared;
  for (let row = y0; row < y1; row++)
    for (let i = row * w + x0; i < row * w + x1; i++) {
      field.dx[i]! *= still[i]!;
      field.dy[i]! *= still[i]!;
    }
  // Only rows a sample can reach are copied: the box of the active operators plus their summed largest shift.
  const reach = Math.ceil(active.reduce((t, a) => t + a.k, 0) * MAX_SHIFT * prepared.frame.unit) + 2;
  const from = Math.max(0, y0 - reach) * w * 4;
  const to = Math.min(field.height, y1 + reach) * w * 4;
  scratch.set(out.subarray(from, to), from);
  applyField(scratch, out, field, x0, y0, x1, y1);
}
