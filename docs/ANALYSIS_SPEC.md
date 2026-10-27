# Analysis specification

All functions live in `src/analysis/` as pure TypeScript and are unit-tested on fixture landmarks.
Reference ranges below are defaults for Phase 1 and are stored in `src/analysis/norms.ts` so the clinical
lead can edit them. Every range is marked `reviewed: false` until the clinical lead signs it off.

## 1. Landmark source
- `@mediapipe/tasks-vision` FaceLandmarker, `runningMode: "VIDEO"` for preview and `"IMAGE"` for stills
- Options: `numFaces: 1`, `outputFacialTransformationMatrixes: true`, `outputFaceBlendshapes: false`
- 478 normalized landmarks (468 mesh + 10 iris). Convert to pixel coordinates using the image size before any measurement
- Head pose (yaw/pitch/roll in degrees) is derived from the facial transformation matrix

### 1.1 Named landmarks (indices to VERIFY in M1)
These indices are the usual MediaPipe face-mesh points but must be confirmed visually with the
Landmark Inspector page (M1) against Google's canonical mesh map before use. Left/right = the SUBJECT's side.

| Name | Index | Notes |
|---|---|---|
| foreheadTop (mesh top, not hairline) | 10 | trichion is NOT detectable; upper third needs a doctor tap |
| glabella | 9 | verify; alternative 151 / 8 |
| softNasion | 168 | verify; alternative 6 |
| pronasale (nose tip) | 1 | alternative 4 |
| subnasale | 2 | verify; alternative 94 |
| labraleSuperius (upper lip top) | 0 | |
| stomionUpper (upper lip inner) | 13 | |
| stomionLower (lower lip inner) | 14 | |
| labraleInferius (lower lip bottom) | 17 | |
| menton (chin bottom) | 152 | |
| exocanthionR / exocanthionL | 33 / 263 | outer eye corners |
| endocanthionR / endocanthionL | 133 / 362 | inner eye corners |
| cheilionR / cheilionL (mouth corners) | 61 / 291 | |
| zygionR / zygionL (face width) | 234 / 454 | mesh edge; approximate |
| gonionR / gonionL (jaw angle) | 172 / 397 | approximate; verify (alternatives 58 / 288) |
| alarR / alarL (nose width) | 129 / 358 | verify |
| irisCenterR / irisCenterL | 468 / 473 | needs the 478-point model |
| irisEdgesR / irisEdgesL | 469–472 / 474–477 | used for iris diameter |
| browR (outer→inner) | 70, 63, 105, 66, 107 | |
| browL (outer→inner) | 300, 293, 334, 296, 336 | |

Any point can be dragged by the doctor; edited points are stored and used instead of the detected ones.

## 2. Capture views and pose targets
| # | View | Expression | Target yaw / pitch / roll (±tolerance) |
|---|---|---|---|
| 1 | Frontal | neutral, lips closed | 0 / 0 / 0 (±3°) |
| 2 | 45° right | neutral | +45 / 0 / 0 (±5°) — sign convention defined in code and tested |
| 3 | 45° left | neutral | −45 / 0 / 0 (±5°) |
| 4 | Profile right | neutral | +90 (±5°) — FaceLandmarker may fail; allow manual mode |
| 5 | Profile left | neutral | −90 (±5°) |
| 6 | Frontal | full smile | 0 / 0 / 0 (±3°) |
| 7 | Frontal | frown | 0 / 0 / 0 (±3°) |
| 8 | Frontal | brows raised | 0 / 0 / 0 (±3°) |
| 9 | Frontal | lips pursed | 0 / 0 / 0 (±3°) |
| 10 | Submental | neutral, head tilted back | pitch target from clinical lead `TODO(clinical)` |
| 11 | Frontal | teeth clenched + neck tensed | 0 / 0 / 0 (±3°) |

Quality checks per frame: exactly one face; face height 45–65 % of frame height (frontal); mean luminance of the
face region within [90, 200] on 0–255; left/right cheek luminance difference < 20 %; blur (variance of Laplacian)
above a calibrated threshold; no strong backlight (background much brighter than face). Thresholds live in
`src/capture/qc.ts` and are tuned on test photos.

## 3. Calibration (pixels → mm)
- Iris diameter (horizontal visible iris diameter) ≈ 11.7 mm in adults (population mean; individual variation about ±0.5 mm)
- mmPerPx = 11.7 / mean(irisDiameterPxR, irisDiameterPxL), from frontal view only
- Every mm value is shown with "≈" and an uncertainty note; ratios and angles are preferred because they are scale-free
- Correct for roll before horizontal/vertical measurements (rotate points around the midpoint of the eyes)

## 4. Frontal metrics (automatic)
For each metric: id, formula, unit, reference (default), how deviation maps to a suggested severity.

| id | Formula | Reference (default, adjustable) |
|---|---|---|
| thirds.middleToLower | dist(glabella, subnasale) / dist(subnasale, menton) | ≈ 1.0 (ideal 1:1) |
| thirds.upper | requires doctor-tapped trichion: dist(trichion, glabella) / dist(glabella, subnasale) | ≈ 1.0 |
| lowerFace.ratio | dist(subnasale, stomion) / dist(stomion, menton), stomion = midpoint(13,14) | ≈ 1 : 2 |
| fifths | widths: outer segment R (zygionR→exocanthionR), eye R, intercanthal, eye L, outer segment L, each / mean eye width | each ≈ 1.0 |
| intercanthal.ratio | dist(endocanthionR, endocanthionL) / mean eye fissure width | ≈ 1.0 |
| canthalTilt.R / .L | angle of endocanthion→exocanthion vs. horizontal (after roll correction), degrees, positive = outer corner higher | about +4° to +8° (sex/ethnicity dependent) |
| lips.upperToLower | vertical height(0→13) / height(14→17) | ≈ 1 : 1.6 |
| mouth.width | dist(cheilionR, cheilionL) compared with the distance between medial iris edges | commissures near medial limbus lines |
| nose.width | dist(alarR, alarL) / intercanthal distance | ≈ 1.0 |
| faceShape.bizygomaticToBigonial | dist(zygionR, zygionL) / dist(gonionR, gonionL) | descriptive only (no "ideal"); larger = more tapered lower face |
| brow.height.R / .L | vertical distance brow peak → pupil center, mm | descriptive; compare R vs L |
| symmetry.<region> | for paired points, |dist to midline R − dist to midline L| / mean; midline = least-squares line through glabella, softNasion, pronasale, subnasale, labraleSuperius, menton | report % per region: brows, eyes, cheeks, mouth, jaw |

Severity suggestion from deviation d = |value − reference| / tolerance: 0 if d < 0.5, 1 if < 1, 2 if < 1.5, 3 if < 2, 4 otherwise.
Tolerance per metric lives in `norms.ts`. These are proportion deviations, NOT validated clinical scales.

## 5. Profile metrics (semi-automatic)
The doctor places/drags points on the profile photo (auto-suggested when landmarks are detected):
soft-tissue glabella, soft nasion, pronasale, columella point, subnasale, labrale superius, labrale inferius,
soft pogonion, cervical point, menton.

| id | Definition | Reference (default) |
|---|---|---|
| nasofrontal | angle glabella–nasion–nasal dorsum tangent | ≈ 115°–135° |
| nasolabial | angle columella tangent – subnasale – labrale superius | women ≈ 95°–110°, men ≈ 90°–100° |
| cervicomental | angle between submental tangent and neck tangent | ≈ 105°–120° |
| eline.upper / eline.lower | signed distance of each lip to line pronasale→soft pogonion (negative = behind) | upper ≈ −4 mm, lower ≈ −2 mm |
| chin.projection | horizontal offset of soft pogonion from a vertical through soft nasion (perpendicular to Frankfort approximation) | descriptive; sex-dependent |

## 6. Clinician-graded findings (0–4)
Not computable from landmarks in Phase 1. The app pre-selects a suggestion only where a proxy exists, the doctor decides:
temple hollowing, mid-face volume loss, tear trough, nasolabial fold, marionette lines, jowls, jawline definition,
chin retrusion, lip fullness, perioral lines, forehead lines (dynamic), glabellar lines (dynamic), crow's feet (dynamic),
platysmal bands, neck laxity, skin quality (fine lines, pores, pigmentation, redness, texture, laxity).
Each records: scale name (e.g., "Merz Aesthetics Scales — Jawline", "Allergan Mid-Face Volume Deficit Scale"),
grade 0–4, note. Reference images for the scales are licensed content: placeholders until `TODO(clinical)` is resolved.
Also record Fitzpatrick type (I–VI) and Glogau photoaging (I–IV).

## 7. Age logic (Phase 1)
- Age bands: 18–29, 30–39, 40–49, 50–59, 60+
- Target age shifts which findings are prioritized and the plan tier default (see docs/TREATMENTS.md §4)
- Apparent age: doctor-entered in Phase 1; Phase 2 adds a model with per-region estimates

## 8. Output object
`Finding = { key, label_fa, label_en, value, unit, reference, deviation, severitySuggested, severity, confidence (0–1 or "manual"), source: "auto"|"semi"|"clinician", scaleName?, status }`

## 9. Tests
- Fixtures: synthetic landmark sets with known geometry (e.g., perfect thirds, 5° roll, known asymmetry)
- Each metric: one exact-value test, one roll-corrected test, one edge case (missing iris → mm values hidden, ratios still shown)
- Golden test on 3–5 consenting test photos in `test-assets/` (not committed): values stable within ±2 % across re-runs
