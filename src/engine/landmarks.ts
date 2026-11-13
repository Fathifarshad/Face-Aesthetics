/**
 * MediaPipe FaceLandmarker point sets (478-point mesh), copied from docs/PRD.md appendix A.
 * These are the standard mesh connections. "Right" is the SUBJECT's right (image left in an unmirrored photo).
 * Side sets run outer → inner; lip sets run from the subject's right mouth corner to the left one.
 * Every other region is built geometrically from these in regions.ts — never from a guessed index.
 */
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150,
  136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
] as const;

export const R_EYE_LOWER = [33, 7, 163, 144, 145, 153, 154, 155, 133] as const;
export const R_EYE_UPPER = [33, 246, 161, 160, 159, 158, 157, 173, 133] as const;
export const L_EYE_LOWER = [263, 249, 390, 373, 374, 380, 381, 382, 362] as const;
export const L_EYE_UPPER = [263, 466, 388, 387, 386, 385, 384, 398, 362] as const;

export const R_BROW_UPPER = [70, 63, 105, 66, 107] as const;
export const R_BROW_LOWER = [46, 53, 52, 65, 55] as const;
export const L_BROW_UPPER = [300, 293, 334, 296, 336] as const;
export const L_BROW_LOWER = [276, 283, 282, 295, 285] as const;

export const LIPS_OUTER_UPPER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291] as const;
export const LIPS_OUTER_LOWER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291] as const;
export const LIPS_INNER_UPPER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308] as const;
export const LIPS_INNER_LOWER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308] as const;

export const ANCHOR = {
  foreheadTop: 10,
  chin: 152,
  noseTip: 1,
  subnasale: 2,
  nasion: 168,
  glabella: 9,
  rEyeOuter: 33,
  rEyeInner: 133,
  lEyeInner: 362,
  lEyeOuter: 263,
  rMouth: 61,
  lMouth: 291,
  upperLipTop: 0,
  lowerLipBottom: 17,
  rFaceEdge: 234,
  lFaceEdge: 454,
} as const;

export type AnchorName = keyof typeof ANCHOR;

/** Number of points the engine expects (iris points 468–477 included, unused here). */
export const LANDMARK_COUNT = 478;
