import { CONCERN_IDS, type ConcernId } from '../data/types';
import { buildFrame, toFace, toPx } from './faceFrame';
import {
  ANCHOR,
  FACE_OVAL,
  L_BROW_LOWER,
  L_BROW_UPPER,
  L_EYE_LOWER,
  L_EYE_UPPER,
  L_NASOLABIAL,
  L_NOSTRIL,
  LIPS_OUTER_LOWER,
  LIPS_OUTER_UPPER,
  R_BROW_LOWER,
  R_BROW_UPPER,
  R_EYE_LOWER,
  R_EYE_UPPER,
  R_NASOLABIAL,
  R_NOSTRIL,
} from './landmarks';
import { centroid, crossingsAtX, crossingsAtY, lerp, offset, outlineOf, quadBezier, smoothPath, type Shape } from './shapes';
import type { FaceFrame, Pt } from './types';

/** R / L = the subject's right / left; M = midline. */
export type Side = 'R' | 'L' | 'M';
export type ProtectId = 'eye' | 'nostril' | 'brow';

export interface Region {
  /** `${concernId}:${side}` or `protect-${id}:${side}`. */
  id: string;
  /** null for regions that exist only to be protected from smoothing. */
  concernId: ConcernId | null;
  protectId: ProtectId | null;
  side: Side;
  /** Smoothing masks must exclude this region (eyes, brows, nostrils, lips). */
  protect: boolean;
  /** Geometry in face coordinates. */
  shape: Shape;
  /** Closed outline in face coordinates. */
  outline: Pt[];
}

export interface RegionSet {
  frame: FaceFrame;
  /** Mesh top (10) to chin (152), in face units. */
  faceHeight: number;
  regions: Region[];
  /** True when the forehead and skin regions reach a hairline measured in the image, not just the mesh top. */
  hairlineMeasured: boolean;
  /** Concerns that cannot be placed on this photo (e.g. the neck is out of frame). */
  missing: ConcernId[];
}

export interface RegionInputs {
  /** Image size in pixels; needed only to decide whether the neck is in frame. */
  size?: { width: number; height: number };
  /** Upper forehead edge from `detectHairline` (face coordinates, subject's right to left). */
  hairline?: readonly Pt[] | null;
}

/**
 * Region geometry, in face units unless a comment says otherwise (1 unit = distance between the outer eye
 * corners). Values marked [SP] come from prompts/SUPERPROMPT.md; the rest were set by eye on the debug page
 * (M1). These are image-region sizes, not clinical values.
 */
export const GEOMETRY = {
  glabellaToNasion: 0.25, // centre sits this far from point 9 toward the nasion, to take in the nasal root
  glabellaRy: 0.14,
  glabellaPadX: 0.02,
  crowsCenter: 0.45, // [SP] fraction of the way from the outer eye corner to the face edge
  crowsRx: 0.4, // × that distance
  crowsRy: 0.55, // × that distance
  underEyeTop: 0.035, // [SP] × face height, below the lower lid
  underEyeBottom: 0.11, // [SP] × face height
  cheekAlong: 0.38, // [SP] fraction of the way from the outer eye corner to the mouth corner
  cheekOut: 0.06,
  cheekRx: 0.19,
  cheekRy: 0.17,
  nasolabialHalfWidth: 0.055, // [SP]
  nasolabialStartScale: 0.5, // narrower beside the nose wing, so the wing itself is left alone
  marionetteHalfWidth: 0.045,
  marionetteStart: { out: 0.03, down: 0.03 }, // from the mouth corner
  marionetteEndOut: 0.07,
  marionetteReach: 0.62, // fraction of the way from the mouth corner down to the jaw
  perioralWiden: 1.2,
  perioralUp: 0.8, // × philtrum height, at the midline
  perioralDown: 0.07,
  chinAlong: 0.55, // from the lower-lip bottom to the chin
  chinRx: 0.22,
  chinRy: 0.42, // × lower-lip-to-chin distance
  jowlOut: 0.12, // lateral to the mouth corner
  jowlUp: 0.09, // above the jaw outline
  jowlRx: 0.15,
  jowlRy: 0.1,
  masseterBelowMouth: 0.12,
  masseterAlong: 0.62, // fraction of the way from the mouth corner to the face edge
  masseterRx: 0.1, // capped at masseterRxOfGap × that distance, so it shrinks on a turned face
  masseterRxOfGap: 0.3,
  masseterRy: 0.19,
  templeAbove: 0.02, // above the brow tail
  templeAlong: 0.55, // from the brow tail to the face edge
  templeRx: 0.42, // × that gap
  templeRxMin: 0.05,
  templeRy: 0.17,
  neckMinRoom: 0.25, // below the chin, otherwise the neck is reported missing
  neckDepth: 0.45,
  neckBelowJaw: 0.05,
  neckHalfWidthTop: 0.38,
  neckHalfWidthBottom: 0.3,
  eyePadUp: 0.045, // above the upper lid margin: lashes and lid crease
  eyePadDown: 0.03, // below the lower lid margin; must stay above the under-eye strip
  eyeWiden: 1.12,
  // Brow protection: the mesh brow stops short of the hairs at the brow head, and the glabella smoothing lightened
  // them (owner review 2026-11-15). Padded above and below, and reaching this far past the head toward the midline.
  browPadUp: 0.02,
  browPadDown: 0.025,
  browHeadReach: 0.06,
  nostrilRxOfSpan: 0.65, // × the width of the nostril ring; the opening sits above or below the ring depending on camera height
  nostrilRxMin: 0.07,
  nostrilRy: 0.07,
} as const;

const SIDES = {
  R: { s: -1, eyeOuter: ANCHOR.rEyeOuter, mouth: ANCHOR.rMouth, lower: R_EYE_LOWER, upper: R_EYE_UPPER, browU: R_BROW_UPPER, browL: R_BROW_LOWER, fold: R_NASOLABIAL, nostril: R_NOSTRIL },
  L: { s: 1, eyeOuter: ANCHOR.lEyeOuter, mouth: ANCHOR.lMouth, lower: L_EYE_LOWER, upper: L_EYE_UPPER, browU: L_BROW_UPPER, browL: L_BROW_LOWER, fold: L_NASOLABIAL, nostril: L_NOSTRIL },
} as const;

/** Positions in FACE_OVAL of the top arc, from the subject's left temple over the top to the right temple. */
const OVAL_TOP_ARC = [4, 3, 2, 1, 0, 35, 34, 33, 32] as const;
/** Positions in FACE_OVAL of the rest of the outline: left temple, down the left side, chin, up to the right temple. */
const OVAL_BELOW_TOP = Array.from({ length: 27 }, (_, i) => i + 5);

/**
 * Places the 16 concern regions of docs/PRD.md §6 and the protected regions on one frontal photo.
 * `lm` are pixel-space landmarks. Without `inputs.hairline` the forehead and skin regions stop at the top of
 * the mesh, which is below the real hairline.
 */
export function buildRegions(lm: readonly Pt[], inputs: RegionInputs = {}): RegionSet {
  const { size, hairline } = inputs;
  const frame = buildFrame(lm);
  const F = (i: number): Pt => toFace(frame, lm[i]!);
  const G = GEOMETRY;
  const oval = FACE_OVAL.map(F);
  const chin = F(ANCHOR.chin);
  const subnasale = F(ANCHOR.subnasale);
  const faceHeight = chin.y - F(ANCHOR.foreheadTop).y;

  /** Lowest point of the face outline on the vertical line at x. */
  const jawAt = (x: number): number => Math.max(chin.y - 1, ...crossingsAtX(oval, x));
  /** Face outline on the horizontal line at y, on side s. */
  const edgeAt = (y: number, s: number, fallback: number): number => {
    const xs = crossingsAtY(oval, y).filter((x) => x * s > 0);
    return xs.length ? s * Math.max(...xs.map((x) => x * s)) : fallback;
  };

  const regions: Region[] = [];
  const missing: ConcernId[] = [];
  const add = (concernId: ConcernId | null, side: Side, shape: Shape, opts: { protect?: boolean; protectId?: ProtectId } = {}) =>
    regions.push({
      id: `${concernId ?? `protect-${opts.protectId}`}:${side}`,
      concernId,
      protectId: opts.protectId ?? null,
      side,
      protect: opts.protect ?? false,
      shape,
      outline: outlineOf(shape),
    });

  // Upper edge of the forehead, from the subject's left to the right: the measured hairline when there is one,
  // otherwise the top arc of the mesh.
  const hairlineMeasured = !!hairline && hairline.length >= 3;
  const topEdge: Pt[] = hairlineMeasured ? [...hairline].sort((a, b) => b.x - a.x) : OVAL_TOP_ARC.map((k) => oval[k]!);

  // 1 — forehead: from the upper brow edges up to that edge.
  const forehead: Shape = { type: 'polygon', pts: [...R_BROW_UPPER.map(F), ...[...L_BROW_UPPER].reverse().map(F), ...topEdge] };

  // 2 — glabella: ellipse between the heads of the two brows, reaching down to the nasal root.
  const browHeadR = F(R_BROW_UPPER[R_BROW_UPPER.length - 1]!);
  const browHeadL = F(L_BROW_UPPER[L_BROW_UPPER.length - 1]!);
  const glabella: Shape = {
    type: 'ellipse',
    c: lerp(F(ANCHOR.glabella), F(ANCHOR.nasion), G.glabellaToNasion),
    rx: Math.abs(browHeadL.x - browHeadR.x) / 2 + G.glabellaPadX,
    ry: G.glabellaRy,
  };

  // 8 — lips: the standard outer lip contour (also protected from smoothing).
  const lipsUpper = LIPS_OUTER_UPPER.map(F);
  const lipsLower = LIPS_OUTER_LOWER.map(F);
  const lips = [...lipsUpper, ...[...lipsLower].reverse().slice(1, -1)];

  // 9 — perioral: the lip contour pushed outward, up toward the nose and a little below the lower lip.
  const lipsC = centroid(lips);
  const philtrum = Math.max(0, F(ANCHOR.upperLipTop).y - subnasale.y);
  const halfMouth = Math.max(1e-6, Math.abs(F(ANCHOR.lMouth).x - F(ANCHOR.rMouth).x) / 2);
  const taper = (p: Pt) => 1 - 0.5 * Math.min(1, Math.abs(p.x - lipsC.x) / halfMouth);
  const widen = (p: Pt) => lipsC.x + (p.x - lipsC.x) * G.perioralWiden;
  const perioral = [
    ...lipsUpper.map((p) => ({ x: widen(p), y: p.y - G.perioralUp * philtrum * taper(p) })),
    ...[...lipsLower].reverse().map((p) => ({ x: widen(p), y: p.y + G.perioralDown * taper(p) })),
  ];

  // 10 — chin: ellipse between the lower lip and the chin point.
  const lowerLip = F(ANCHOR.lowerLipBottom);
  const chinShape: Shape = {
    type: 'ellipse',
    c: lerp(lowerLip, chin, G.chinAlong),
    rx: G.chinRx,
    ry: G.chinRy * Math.abs(chin.y - lowerLip.y),
  };

  const sided: Partial<Record<ConcernId, Partial<Record<'R' | 'L', Shape>>>> = {};
  const put = (id: ConcernId, side: 'R' | 'L', shape: Shape) => ((sided[id] ??= {})[side] = shape);

  for (const side of ['R', 'L'] as const) {
    const d = SIDES[side];
    const s = d.s;
    const eyeOuter = F(d.eyeOuter);
    const mouth = F(d.mouth);

    // 3 — crow's feet: ellipse between the outer eye corner and the face edge at that height.
    const edgeX = edgeAt(eyeOuter.y, s, F(side === 'R' ? ANCHOR.rFaceEdge : ANCHOR.lFaceEdge).x);
    const gap = Math.abs(edgeX - eyeOuter.x);
    put('crows-feet', side, {
      type: 'ellipse',
      c: { x: eyeOuter.x + s * G.crowsCenter * gap, y: eyeOuter.y },
      rx: G.crowsRx * gap,
      ry: G.crowsRy * gap,
    });

    // 4 — under-eye: strip below the lower lid.
    const lid = d.lower.map(F);
    put('tear-trough', side, {
      type: 'polygon',
      pts: [...lid.map((p) => offset(p, 0, G.underEyeTop * faceHeight)), ...[...lid].reverse().map((p) => offset(p, 0, G.underEyeBottom * faceHeight))],
    });

    // 5 — cheek: on the line from the outer eye corner to the mouth corner, a little outward.
    put('midface-volume', side, {
      type: 'ellipse',
      c: offset(lerp(eyeOuter, mouth, G.cheekAlong), s * G.cheekOut, 0),
      rx: G.cheekRx,
      ry: G.cheekRy,
    });

    // 6 — nasolabial fold: strip along the mesh points that follow the fold, from the groove beside the nose
    // wing to just outside and below the mouth corner. Narrower at the top so the nose wing is not covered.
    put('nasolabial-fold', side, {
      type: 'band',
      path: smoothPath(d.fold.map(F)),
      halfWidth: G.nasolabialHalfWidth,
      startScale: G.nasolabialStartScale,
    });

    // 7 — marionette: strip from the mouth corner down toward the jaw outline.
    const mStart = offset(mouth, s * G.marionetteStart.out, G.marionetteStart.down);
    const mEndX = mouth.x + s * G.marionetteEndOut;
    const mEnd = { x: mEndX, y: mouth.y + G.marionetteReach * (jawAt(mEndX) - mouth.y) };
    put('marionette', side, { type: 'band', path: quadBezier(mStart, lerp(mStart, mEnd, 0.5), mEnd, 8), halfWidth: G.marionetteHalfWidth });

    // 11 — jawline / jowl: ellipse just above the jaw outline, lateral to the mouth corner.
    const jowlX = mouth.x + s * G.jowlOut;
    put('jawline', side, { type: 'ellipse', c: { x: jowlX, y: jawAt(jowlX) - G.jowlUp }, rx: G.jowlRx, ry: G.jowlRy });

    // 12 — masseter: ellipse between the mouth corner and the face edge, just below mouth level.
    const massY = mouth.y + G.masseterBelowMouth;
    const massGap = Math.abs(edgeAt(massY, s, mouth.x + s * 0.3) - mouth.x);
    put('masseter', side, {
      type: 'ellipse',
      c: { x: mouth.x + s * G.masseterAlong * massGap, y: massY },
      rx: Math.min(G.masseterRx, G.masseterRxOfGap * massGap),
      ry: G.masseterRy,
    });

    // 13 — temple: between the brow tail and the face edge.
    const tail = F(d.browU[0]);
    const templeY = tail.y - G.templeAbove;
    const templeGap = Math.abs(edgeAt(templeY, s, tail.x + s * 0.1) - tail.x);
    put('temple', side, {
      type: 'ellipse',
      c: { x: tail.x + s * G.templeAlong * templeGap, y: templeY },
      rx: Math.max(G.templeRxMin, G.templeRx * templeGap),
      ry: G.templeRy,
    });

    // 14 — brow: the standard brow contour (also protected from smoothing).
    put('brow', side, { type: 'polygon', pts: [...d.browU.map(F), ...[...d.browL].reverse().map(F)] });
  }

  // 15 — neck: only when there is room below the chin in the photo.
  let neck: Shape | null = null;
  if (size) {
    const room = (size.height - lm[ANCHOR.chin]!.y) / frame.unit;
    if (room >= G.neckMinRoom) {
      const top = Array.from({ length: 9 }, (_, i) => {
        const x = -G.neckHalfWidthTop + (i * 2 * G.neckHalfWidthTop) / 8;
        return { x, y: jawAt(x) + G.neckBelowJaw };
      });
      const bottomY = chin.y + Math.min(G.neckDepth, room - 0.03);
      neck = { type: 'polygon', pts: [...top, { x: G.neckHalfWidthBottom, y: bottomY }, { x: -G.neckHalfWidthBottom, y: bottomY }] };
    }
  }

  // 16 — skin quality: the whole face — the mesh outline below the temples, closed at the top by the forehead edge.
  const skin: Shape = { type: 'polygon', pts: [...OVAL_BELOW_TOP.map((k) => oval[k]!), ...[...topEdge].reverse()] };

  const midline: Partial<Record<ConcernId, Shape | null>> = {
    'forehead-lines': forehead,
    'glabellar-lines': glabella,
    'lip-volume': { type: 'polygon', pts: lips },
    'perioral-lines': { type: 'polygon', pts: perioral },
    chin: chinShape,
    neck,
    'skin-quality': skin,
  };

  // Emit in the order of the PRD table.
  for (const id of CONCERN_IDS) {
    const pair = sided[id];
    const protect = id === 'brow' || id === 'lip-volume';
    if (pair) {
      add(id, 'R', pair.R!, { protect });
      add(id, 'L', pair.L!, { protect });
    } else if (midline[id]) add(id, 'M', midline[id], { protect });
    else missing.push(id);
  }

  // Protected only: eyes (padded to cover lashes and the lid crease) and nostrils.
  for (const side of ['R', 'L'] as const) {
    const d = SIDES[side];
    const eye = [
      ...d.upper.map(F).map((p) => offset(p, 0, -G.eyePadUp)),
      ...[...d.lower].reverse().map(F).map((p) => offset(p, 0, G.eyePadDown)),
    ];
    const cx = centroid(eye).x;
    add(null, side, { type: 'polygon', pts: eye.map((p) => ({ x: cx + (p.x - cx) * G.eyeWiden, y: p.y })) }, { protect: true, protectId: 'eye' });
  }
  for (const side of ['R', 'L'] as const) {
    const d = SIDES[side];
    const upper = d.browU.map(F).map((p) => offset(p, 0, -G.browPadUp));
    const lower = d.browL.map(F).map((p) => offset(p, 0, G.browPadDown));
    // The sets run outer → inner, so the last points are the head; the midline is at −s.
    const head = lerp(upper[upper.length - 1]!, lower[lower.length - 1]!, 0.5);
    const beyond = { x: head.x - d.s * G.browHeadReach, y: head.y };
    add(null, side, { type: 'polygon', pts: [...upper, beyond, ...[...lower].reverse()] }, { protect: true, protectId: 'brow' });
  }
  for (const side of ['R', 'L'] as const) {
    const ring = SIDES[side].nostril.map(F);
    const xs = ring.map((p) => p.x);
    const c = { x: ring.reduce((t, p) => t + p.x, 0) / ring.length, y: ring.reduce((t, p) => t + p.y, 0) / ring.length };
    const rx = Math.max(G.nostrilRxMin, G.nostrilRxOfSpan * (Math.max(...xs) - Math.min(...xs)));
    add(null, side, { type: 'ellipse', c, rx, ry: G.nostrilRy }, { protect: true, protectId: 'nostril' });
  }

  return { frame, faceHeight, regions, hairlineMeasured, missing };
}

/** Region outline in pixels, ready for drawing or rasterising. */
export const outlinePx = (set: RegionSet, region: Region): Pt[] => region.outline.map((q) => toPx(set.frame, q));
