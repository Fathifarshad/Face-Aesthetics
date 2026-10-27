/**
 * MediaPipe FaceLandmarker indices (478-point model). Left/right = the SUBJECT's side.
 * Source: docs/ANALYSIS_SPEC.md §1.1. Status: NOT yet verified with the Landmark Inspector (M1 V-step).
 */
export const LM = {
  foreheadTop: 10, // mesh top, not hairline — trichion is not detectable
  glabella: 9, // alternatives 151 / 8
  softNasion: 168, // alternative 6
  pronasale: 1, // nose tip; alternative 4
  subnasale: 2, // alternative 94
  labraleSuperius: 0, // upper lip top (vermilion border, midline)
  stomionUpper: 13, // upper lip inner
  stomionLower: 14, // lower lip inner
  labraleInferius: 17, // lower lip bottom
  menton: 152, // chin bottom
  exocanthionR: 33, // outer eye corner, subject right
  exocanthionL: 263,
  endocanthionR: 133, // inner eye corner, subject right
  endocanthionL: 362,
  cheilionR: 61, // mouth corner, subject right
  cheilionL: 291,
  zygionR: 234, // face-mesh edge at cheekbone level (approximate)
  zygionL: 454,
  gonionR: 172, // jaw angle (approximate; alternatives 58 / 288)
  gonionL: 397,
  alarR: 129, // nose wing
  alarL: 358,
  irisCenterR: 468,
  irisCenterL: 473,
  irisEdgesR: [469, 470, 471, 472],
  irisEdgesL: [474, 475, 476, 477],
  browR: [70, 63, 105, 66, 107], // outer → inner
  browL: [300, 293, 334, 296, 336],
} as const;

/** Lower face outline from right jaw angle through menton to left jaw angle (mesh silhouette). */
export const JAW_CONTOUR = [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397] as const;

/** Face oval used for masks (mesh silhouette, clockwise from forehead top). */
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149,
  150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
] as const;

export const LEFT_EYE_RING = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466] as const;
export const RIGHT_EYE_RING = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246] as const;
export const LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185] as const;

/** Points that should lie on the facial midline (spec §4 symmetry). */
export const MIDLINE_POINTS = [
  LM.glabella,
  LM.softNasion,
  LM.pronasale,
  LM.subnasale,
  LM.labraleSuperius,
  LM.menton,
] as const;

/** Paired points per symmetry region: [subject right, subject left]. */
export const SYMMETRY_PAIRS = {
  brows: [
    [LM.browR[0], LM.browL[0]],
    [LM.browR[2], LM.browL[2]],
    [LM.browR[4], LM.browL[4]],
  ],
  eyes: [
    [LM.exocanthionR, LM.exocanthionL],
    [LM.endocanthionR, LM.endocanthionL],
  ],
  cheeks: [[LM.zygionR, LM.zygionL]],
  mouth: [[LM.cheilionR, LM.cheilionL]],
  jaw: [[LM.gonionR, LM.gonionL]],
} as const;

export type SymmetryRegion = keyof typeof SYMMETRY_PAIRS;
