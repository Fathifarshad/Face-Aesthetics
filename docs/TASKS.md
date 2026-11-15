# Milestones — PRD 2.0

Source: docs/PRD.md §13 (M0–M11) and prompts/SUPERPROMPT.md. One milestone at a time: short plan → wait for
«ادامه» → build → verify → report in ≤ 10 lines → commit `feat(Mx): ...` (no push).

Legend: [ ] todo · [x] done and verified · [~] exists from the v1 kit, must be reworked to the v2 spec · (V) acceptance check

Status 2026-11-15: M0–M3 done (owner confirmed regions and smoothing by eye). M4 (warp) built; waiting for the owner's look at the shape changes and a render time on a real phone. M5 (grading, age target) built; waiting for the owner's look. Next: M6.

## What the v1 kit already provides (built 2026-10-27, kept until replaced)

| v1 milestone | State | Goes into |
|---|---|---|
| Landmark engine + Inspector page | built; human check of indices never done | M1 |
| Guided capture, QC, ghost overlay, per-service photo sets | built; thresholds uncalibrated | stays; reviewed in M8 |
| Dexie schema, patients, intake, simple consent toggles | built; no encryption, no app lock | M2, M8 |
| Proportion metrics (thirds, fifths, symmetry, iris calibration) | built, 40 unit tests | stays as a secondary analysis tab |
| Approximate simulation (one global slider, main thread) | built | replaced by M3–M4 |
| Target-age slider (actual → actual − 15) | built | replaced by M5 |
| Treatment options without numbers, tiers, sequencing, contraindications | built, 19 unit tests | rebuilt on `src/data` in M6–M7 |
| MD Codes zones page, emergency page | built | M7 |
| Sign-off, print report, compare page | built | M9, M8 |
| Client app (`/#/client`) and file exchange | built | M11 |

## M0 — Setup and alignment
- [x] PRD 2.0, BRAND 2.0 and SUPERPROMPT copied into `docs/` and `prompts/`; owner decisions recorded in PRD §0
- [x] Old docs aligned: status notes on ANALYSIS_SPEC, TREATMENTS, SAFETY; prompts, `/next-milestone` skill and reviewer agent updated
- [x] App name نوا (NEVA) from one constant (`src/app/config.ts`): UI, report, `index.html`, PWA manifest
- [x] Colour tokens as CSS variables in `src/styles.css`, read by `tailwind.config.ts`; class names follow BRAND 2.0 (`primary`, `ink-2`, `muted`, `risk`, `draft`, …); no colour literals left in components
- [x] Doctor app frame with five sections (پرونده‌ها، عکاسی، شبیه‌سازی، طرح درمان، قبل و بعد): tab bar, steps per section, placeholders for the two sections not built yet
- [x] `src/engine` and `src/data` created with the PRD §9 types; lint rule keeps them free of React and UI imports
- [x] Wording: «توکسین» instead of «بوتاکس»; Latin digits in the Persian UI
- [x] Guard test for hard rules 9 and 16 and a static check for rule 8 (`src/app/guards.test.ts`)
- [x] (V) `npm run check` green (89 unit tests); Playwright green (5 tests) at 360, 390 and 430 px; screenshots in `test-results/screens/`

## M1 — Regions and debug overlay
- [x] `src/engine/faceFrame.ts`, `landmarks.ts` (PRD appendix A sets), `shapes.ts`, `regions.ts` (16 concern regions and the protected regions, built geometrically; settings in `GEOMETRY`)
- [x] Debug page `/#/dev/regions` (link in Settings): every region drawn with its number and colour, anchor indices written out, protected regions, face axes, zoom on the face, per-region show/hide, save image, warnings for no face, several faces and a head turned more than 8°
- [x] Unit tests (15): frame round trip, mirrored photo, invariance to rotation, scale and shift, left/right symmetry, anatomical ordering, protected regions, neck out of frame
- [x] `e2e/regions.spec.ts` writes `<photo>-regions.jpg` and `<photo>-protect.jpg` for every file in `test-assets/` into `test-results/regions/`; page checked at 360, 390 and 430 px
- [~] First check by Claude on the local photos (2026-11-13): placement looks right on the one neutral frontal photo (`20261112_230515`). Tuned after looking: nose-wing width, nostril and eye protection, masseter, glabella, neck size
- [~] Second check by Claude after the owner added four close-up photos of four more people (2026-11-13): regions land on the expected anatomy on all five faces, including a head tilted 13° (the frame follows the tilt). On close-up selfies the lower face is narrow in the image, so masseter, jowl and marionette overlap; each still sits on its own structure
- [x] Owner feedback 2026-11-13 (nasolabial strip off the fold, forehead too small, skin region smaller than the face, colours, list under the photo) — fixed:
  - nasolabial strip now follows mesh points `129, 203, 206, 216, 212` / `358, 423, 426, 436, 432`, verified by plotting every mesh index on two frontal photos; narrower beside the nose wing
  - nostril protection from the mesh nostril ring instead of an estimate; the estimated nose-wing point is gone
  - `src/engine/hairline.ts`: the upper forehead edge is measured in the picture (skin colour above each brow, walking up); forehead and skin regions reach it. Falls back to the mesh top when it cannot be measured
  - skin region = the whole face outline closed by that edge (no inward shrink)
  - overlay colours: one lightness and chroma, hue only varies (tokens `--region-1…8`)
  - debug page: region list beside the photo on a wide screen; on a phone the photo stays pinned while the list scrolls
- [x] Owner review 2026-11-15 on the three frontal photos (review page `test-results/regions/review.html`): 15 regions correct; on `20261114_001749` region 1 (forehead) reached slightly into the hair. Fixed in `hairline.ts`: a patch that is below 88 % of the reference brightness **and** textured (brightness spread > 2 × the reference, clamped to 4–6 levels) counts as hair after 6 steps; a column whose reference is below 75 % of the median reference starts in hair and ends just above the brow. Edge moved down 0.05–0.13 face units on that photo, ≤ 0.06 on the other two. 2 unit tests (fail on the old code)
- [x] (V) Owner confirmed the regions after the hairline fix (2026-11-15: «نواحی تأیید است»). M1 done
- Note: the acceptance check asked for 5 neutral frontal photos; only 3 near-frontal ones exist, and the owner reviewed those. Photos within the pose limit and neutral: `20261112_230515` only. Close: `20261114_001811` (pitch 10°), `20261114_001749` (tilt 13°, yaw 6°). Not usable as frontal: `20261114_001802` (pitch 21°), `20261114_001815` (smile), the four 45° views, `portrait.jpg` (smile)

Open points from M1:
- Mesh indices outside PRD appendix A are now used for the nasolabial fold and the nostrils (owner asked for more accuracy). They are listed in `src/engine/landmarks.ts`, in PRD appendix A and on the debug page. The other lateral regions (cheek, marionette, jowl, masseter, temple, crow's feet) are still placed geometrically
- The hairline search compares colour and texture, so it can stop early on a strongly shadowed or very lined forehead and run past the hairline on a shaved or bald head (capped at 0.75 face units above the brows). The debug page has a switch to compare with and without it
- Playwright now writes its own output to `test-results/playwright/` (it empties that folder on every run); evidence images stay in `test-results/regions/`, `test-results/simulate/`, `test-results/screens/`
- The neck region cannot tell skin from clothing or a headscarf; the doctor turns the neck change off in that case
- Lateral regions (crow's feet, temple, masseter, cheek) spill past the face edge on a turned head; masks are clipped to the face outline in M3
- `test-assets/portrait.jpg` is a photo of a real, recognisable person. Hard rule 11 asks for synthetic test data: replace it (the flow test `e2e/smoke.spec.ts` reads this file name)

## M2 — Records, encryption, app lock
- [x] `src/db/crypto.ts`: one random AES-GCM 256 image key, stored only wrapped by a PBKDF2-SHA-256 key (600 000 iterations) from the passphrase and, a second time, from a recovery code. No new dependency (Web Crypto)
- [x] `src/db/vault.ts`: session key in memory only; create, unlock, lock, change passphrase, recover with code (the code is replaced after use), renew code; images saved before the vault existed are encrypted on first unlock
- [x] `src/db/images.ts`: the only path to photos, simulation images and signatures; rows hold `sealed` ciphertext. All doctor pages and the client-package export go through it
- [x] `src/app/VaultGate.tsx`: passphrase setup (min 8 characters), recovery code shown once, lock screen, auto-lock after 5 minutes idle; lock button on the patients page
- [x] Admin panel `/#/admin` (owner request 2026-11-13; replaces the settings page): security, physician and clinic, pricing and safety, aftercare, data on this device, tools
- [x] Complete deletion: deleting a patient also removes the audit entries of their cases
- [x] EXIF is dropped on import (canvas re-encode in `processPhoto`), now covered by a test
- [x] (V) `e2e/security.spec.ts` (5 tests, synthetic image): raw IndexedDB row has no blob, no JPEG header and no EXIF text; wrong passphrase refused; lock by button, idle and reload; passphrase change; recovery; all nine stores empty after deleting the patient. 13 unit tests in `src/db/crypto.test.ts`

Open points from M2:
- Only images are encrypted. Patient name, phone, intake answers, messages, findings and the clinic logo are stored in plain form (the owner did not ask for more; the admin panel says so). Encrypting them is a separate piece of work
- The client app (`/#/client`) is not locked or encrypted; revisit in M11
- Patient record fields were not reshaped to PRD §9 (the v1 fields — display name, file number, phone — are still used by the client app); Fitzpatrick stays in the intake form
- Stored photos keep up to 2560 px on the long side since 2026-11-15 (was 1600; photos saved before stay at 1600). The engine works on a crop around the face of ≤ 1280 px (1024 on touch devices)
- Automatic deletion after the retention period is still not built (the setting exists and says so)
- The IndexedDB database is still named `tanasob`; renaming would orphan existing data

## M3 — Band smoothing
- [x] Built (2026-11-14): `blur.ts` (3-pass box blur), `masks.ts` (soft region masks, protection and face clipping), `bands.ts` (layer split, per-type coefficients, highlights keep 40 %), `pipeline.ts` (prepare once, render per slider move, 85 % cap), `pipeline.worker.ts` (Web Worker), page `SimulatePage.tsx` (switch + slider per region, before/after divider, burned-in simulation label)
- [x] Deviation from PRD §5.4, found by measurement: with 4 layers and the PRD coefficients a dark line loses at most 58 % contrast (test wants 60 %) and a broad hollow sits in the base layer. Added a 5th layer (LP4 = 0.12 face width, 'band3') and raised band2 of 'fine' to 0.6, 'deep' to 0.85, 'hollow' to 0.9. **Approved by the owner 2026-11-15**, recorded in PRD §5.4
- [x] Unit tests (18, `smoothing.test.ts`): exact layer sum, ≥ 60 % contrast loss per type, nothing changes outside the mask, no bright rim, nothing changes inside eyes/brows/nostrils/lips, 85 % cap
- [x] `e2e/simulate.spec.ts` (2026-11-15, 5 tests): switches and sliders (cap 85), "all off" returns the photo unchanged above the label, the label bar is on the "after" canvas, compare divider, no horizontal scroll at 360/390/430 px. Per frontal photo it writes `<photo>-60.jpg`, `<photo>-85.jpg` (before | after), `-diff.jpg` (×8) and `<photo>.txt` into `test-results/simulate/`. Helper `newCaseWithFrontal()` in `e2e/helpers.ts`
- [~] Render time measured in desktop Chromium with Pixel 7 emulation (worker, 18 slider moves per photo): median 2.6–6.0 ms, max 13.3 ms on four photos. Still to measure on a real mid-range phone (open `/#/doctor/case/<id>/simulate`, read `data-render-ms` on the "after" canvas)
- [ ] (V) Owner has not yet looked at the result on a real photo. Findings from the images (2026-11-15):
  - the effect lands on the right places: under-eye, nasolabial, crow's feet, marionette, glabella
  - forehead lines change little on `20261112_230515` → fixed 2026-11-15: 'fine' band2 0.6 → 0.8, band3 0 → 0.3 (PRD §5.4)
  - moustache hair inside the nasolabial and perioral masks is smoothed too → fixed 2026-11-15: `src/engine/hair.ts` protects pixels darker than 0.6 × the median cheek luminance (majority vote over 0.012 face units, soft edge 0.01). Light hair (blond, grey, fine stubble) is not found
  - the working box was small (≈ 350 × 530 px) → fixed 2026-11-15: the size limit now applies to a crop around the face (`faceCrop` in `SimulatePage.tsx`) and stored photos keep 2560 px. Box on a phone ≈ 490 × 755 px; desktop render median 11 ms (was 6)
- [x] Owner review 2026-11-15 on `test-results/simulate/review.html`: "no noticeable difference; 60 % is not enough; plastic". Fixed:
  - `fine` (pores, grain) is never attenuated and band1 less, so texture stays (the plastic look)
  - low-passes are skin-only averages (normalised convolution with weight = face × (1 − protected − hair)); before, the dark eye pulled the reference level of the under-eye hollow down and the hollow was hardly lifted
  - 6th layer `band4 = LP4 − LP5` (LP5 = 0.25 face width) for the widest shadows; band2/band3 up to 1 for folds and hollows
  - folds and hollows fade out over a wider edge (0.04 units, gain 2) just outside the approved outlines
  - start value of the sliders 0.6 → 0.75; the cap stays 0.85. New coefficients in PRD §5.4
  - e2e: change numbers now leave out the label bar (it hid the real change); a 2× zoom of the mid-face is written per photo
- [x] Owner review 2 (2026-11-15, photo `20261114_001811`): "dark patches under the eye and beside the mouth look artificial; pictures a bit matte". Cause: the hair detector took the smooth shadow of a deep crease on a brightly lit face for hair, protected it, and the skin around it was lifted. Fixed:
  - `hair.ts`: hair must be dark **and** rough (local roughness ≥ 2 × the cheeks', at least 3 levels); patches smaller than (0.06 face units)² are dropped (wrinkle clusters under the eye)
  - `HIGHLIGHT_KEEP` 0.4 → 0.15 so the natural shine of the skin is not dulled (deviation from SUPERPROMPT, recorded in `bands.ts`)
- [x] (V) Owner looked at the corrected result and accepted it (2026-11-15: «اوکی هست»). M3 done
- [ ] Owner note 2026-11-13/14: the effect of the old « ساخت شبیه‌سازی » button on the target-age page was barely visible. The old engine (`src/simulation`) is untouched and still used there; the new page is the replacement. Check visibility of the new effect on real photos at the default 60 % and decide whether the default or the cap should be higher
- [x] M1 was still open when M3 was started, against the SUPERPROMPT rule; resolved 2026-11-15 when the owner confirmed the regions

## M4 — Warp and before/after slider
- [x] `src/engine/warp.ts` (2026-11-15): inflate `src = c + (p − c)(1 − a·w)` (per-axis gain) and vector `src = p − v·w`, `w = (1 − (r/R)²)²` on an ellipse aligned with the face axes; displacement maps computed once per photo, a slider move scales and adds them; one bilinear sample. Max 0.06 face units per operator (SUPERPROMPT); vectors ≤ 0.5 × the smaller radius and inflate factor ≤ 0.5 (centre magnified ≤ 2×), so the picture cannot fold
- [x] Operators (directions from the M4 plan, owner did not object): lips fill out (upper and lower lip, mostly vertically) · cheek fill + lift up/out · nasolabial: tissue beside the fold up/out · marionette: mouth corner up · chin: a little longer + slightly fuller · jowl up/in · masseter in · temple fill · brow tail up. Order: smoothing, then warp (SUPERPROMPT)
- [x] `pipeline.ts`: per-side strength (`Change.left`), smoothing result cached while only warp sliders move, `render(..., { warp: false })` for smoothing-only tests
- [x] Page: mirror switch per bilateral change (default on; off → right/left sliders), «هم‌اندازه کن» copies the side moved last, touching a region opens its card (smallest region under the finger wins), the open change is outlined on the photo (F4.7). Divider: drag starts on the handle or after an 8 px move; a tap picks a region. Shape-only changes (lips, jaw, masseter, brow, midface) start off until M5 sets defaults
- [x] Unit tests (`warp.test.ts`, 7): every W concern has operators, both sides; zero strength returns the input; each operator ≤ 0.06 units and nothing outside its box; no fold (det(I − ∇d) > 0.3) and no shift on the working-box border with everything at the cap; directions; left field mirrors the right on the symmetric face; left at 0 leaves the left side untouched
- [x] e2e (`simulate.spec.ts`): mirror, two sliders, match, tap-to-select with outline; per photo `-warp.jpg`, `-warp-diff.jpg`, `-warp-zoom.jpg` and render times. Desktop Chromium, Pixel 7 emulation (working box ≈ 490 × 750): warp slider move median 7.6–7.9 ms, smoothing slider move median 18–20 ms (max 31)
- [x] Owner review 1 (2026-11-15): "the man's chin looks feminine; jawline and jowl hollowed, unnatural". Cause: the chin vector
  pulled only the middle down (pointed chin), and the jowl (up **and in**) and masseter (wide, in) operators both pulled the lower
  face inward. Fixed: chin moves down evenly (wide vector) and widens, a man's less long and wider (patient sex now goes to the
  engine); jowl lifted straight up; new jaw-angle operator under «خط فک و جول» (a little fuller outward); masseter moves only the
  lateral contour (narrower operator, 0.045 → 0.03). Unit test for male vs female chin; e2e test cases carry the photo's sex
- [x] Owner review 2 (2026-11-15): "photo 1: eyes unnatural; photos 2 and 3: a dent at the jaw line / jowl". Causes: the cheek lift
  and brow-tail lift reached the eyelids; the jaw operators were built from the jowl and masseter regions, which sit near the mouth
  corners on close-up photos (M1 open point), so they pushed the middle of the lower cheek. Fixed: the warp never moves the eyes
  (displacement × (1 − eye mask), eye outline grown 1.35 × 2, soft edge 0.08 units, gain 2); jowl, jaw-angle and masseter operators
  are placed on the face outline at fixed heights between mouth and chin. Unit tests: eyes still at full strength with no fold;
  jaw operators cross the face outline
- [x] Owner review 3 (2026-11-15): "photos 2 and 3: the brow heads are changed; the lips go from thin at the corners to suddenly full in
  the middle; changes must suit lip types 1–5; work like a facial aesthetic designer". Fixed:
  - brow heads: the mesh brow stops short of the head hairs and the glabella smoothing lightened them. New protection region per side
    (`protect-brow`): brow padded 0.02 up, 0.025 down, reaching 0.06 past the head toward the midline
  - lips: new operator kind `lip` in `warp.ts`. The vermilion border moves outward at every column by 0.38 × the local lip thickness
    at full strength (soft band 1.3 × thickness, so the mouth line hardly moves and nothing can fold); corners move by their own
    thickness, i.e. almost not at all. The upper : lower share is nudged toward 1 : 1.6 (factor ≤ 1.25)
  - lip type 1–5 (`src/data/lipTypes.ts`, draft): suggested from lip fullness (lip height at the middle ÷ mouth width; bounds 0.24,
    0.30, 0.36, 0.42), chosen by the doctor in the lip card, stored in `simStates.lipType`; it scales the lip slider (1 → 100 %,
    5 → 20 %). Measured on the test photos: 0.29, 0.31, 0.25 and 0.19 (that one smiling, which lowers the measure)
  - Unit tests: lip shift ∝ thickness, corners still; protection list. e2e writes the lip fullness per photo
- [ ] (V) Owner checks the shape changes again on `test-results/simulate/review.html` («+ فرم و حجم»)
- [ ] (V) Re-render < 50 ms on a real mid-range phone: not measured yet (open `/#/doctor/case/<id>/simulate`, read `data-render-ms` on the "after" canvas). Desktop numbers above leave ~2.5× headroom for smoothing moves
- Note: the eye-bag bulge is not flattened; PRD §6 gives the under-eye concern S only. A warp for it would need an owner decision

## M5 — Grading and target age
Owner decisions for M5 (2026-11-15): shape and volume concerns get a manual grade («درجهٔ دستی»); changing the target moves only
sliders the doctor has not touched, plus «بازگشت به پیش‌فرض»; a fourth target «سن دلخواه» where the doctor types an approximate age.
- [x] `src/engine/grading.ts`: index = shadow energy of the bands that carry the concern's kind of shadow (lines LP1−LP3, folds
  LP2−LP4, hollows LP3−LP5), in % of the median cheek brightness; skin quality = fine-texture contrast in %. Per side for the
  bilateral concerns. Confidence: low with a turned head (yaw > 8°, pitch > 10°), bad exposure, no cheek reference or a tiny region;
  mid near a boundary; capped per concern. Worker request `grade`
- [x] Auto-graded: forehead, glabella, crow's feet, under-eye, nasolabial, marionette, perioral, neck, skin (`AUTO_GRADED` in
  `src/data/concerns.ts`). Manual: lips, chin, jaw, masseter, brow, midface volume, temple. Reference scale names from the v1 catalogue (draft)
- [x] `src/data/gradeThresholds.ts`: draft thresholds per concern, set by Claude on 6 test photos of 5 people, `TODO(clinical)`.
  A first index (region ÷ cheek shadow energy) gave grade-4 folds to a 25-year-old with smooth cheeks and was dropped.
  On the test photos only the under-eye and marionette indices ranked the two older faces above the two young ones; their
  confidence is capped at "mid", all others at "low". Indices per photo: `test-results/grading/<photo>.txt`
- [x] `src/data/ageNorms.ts`: `allowed`, `intensity`, `targetAgeOf`, `defaultIntensity` (PRD §5.3 formula, same draft
  coefficients for every concern), `SAFETY_CEILING` 0.85 (the engine's `MAX_INTENSITY` reads it)
- [x] Dexie version 2: `grades` (one row per concern and side) and `simStates` (age target + the doctor's own slider settings);
  both removed on patient deletion. `src/db/simRepo.ts`; the v1 case fields `targetAge` and `tier` follow the target so the v1 plan,
  report and client package keep working
- [x] Page «درجه‌بندی» (`/#/doctor/case/<id>/grading`, first step of the simulation section): photo with the selected region outlined,
  per concern auto/manual tag, «تأییدنشده» badge, scale name, 0–4 per side, confirm / reject / review again, "confirm all
  high-confidence". Only confirmed or edited grades feed the simulation (F2.4)
- [x] Simulation page: real age (editable), target buttons and «سن دلخواه», default slider = `intensity` per side (mirror off when the
  sides differ), «دستی» tag on moved changes, «بازگشت به پیش‌فرض», «ذخیرهٔ تصویر شبیه‌سازی» (whole photo, label burned in; replaces the
  v1 target-age page, which is removed; `/age` redirects to grading). Step order: درجه‌بندی، شبیه‌سازی، آنالیز تناسبات
- [x] Shared engine loader `src/features/doctor/useEngine.ts` (grading and simulation pages)
- [x] (V) Unit tests: `allowed`, `intensity`, target age, defaults, overrides survive a target change (16, `ageTarget.test.ts`);
  grading on the synthetic face (4, `grading.test.ts`). e2e `grading.spec.ts`: indices on 6 photos, review → target → sliders,
  manual slider kept, custom age, reset, save image, no horizontal scroll at 360/390/430. `npm run check` 172 tests, Playwright 37 green
- [x] Clinical-safety review (SUPERPROMPT step 7), 3 gaps fixed: «تأییدنشده» badge for the draft age table on the simulation page and
  for the draft scale names on the grading page; on a signed case the age target, real age and image save are locked (the client
  package reads them; a "re-open for changes" flow belongs to M9). The v1 plan page can still be edited after sign-off (older gap, M9)
- [ ] (V) Owner looks at the grading page and the age target on a real case
- Open: thresholds and age coefficients are drafts for a senior physician; the index is sensitive to lighting, a smile, hair and
  clothing (neck). Motion photos (PRD §8) are not used for grading yet

## M6 — Knowledge base and sorting
- [~] 16 concerns × options in `src/data` with every field of PRD §6, `status` and `source`
- [ ] Sort by result, cost, onset, durability, downtime; choosing an option updates the image (`fx`)
- [ ] (V) Each option changes the image; `draft` items carry the «تأییدنشده» badge

## M7 — MD Codes, estimates, cost
- [~] MD Codes layer for selected filler options only; warning codes; fixed disclaimer
- [ ] Volume and dose ranges (PRD §5.7), plan totals in syringes and vials, clinic tariff, doctor override
- [ ] (V) Unit tests for estimates and totals; high-risk zone warnings visible

## M8 — Before/after gallery and consent
- [~] Photo sets per procedure (PRD §8), ghost overlay from the before photo
- [ ] Three consent levels with name, date and touch signature; revocation
- [ ] Compare: side by side, slider, simulation vs real result
- [ ] (V) No photo in any shareable output without level-3 consent; revocation works

## M9 — Report
- [~] PDF report with clinic branding, simulation with burned-in label, line items, sessions, disclaimer
- [ ] (V) No report without doctor approval; the simulation label is on the image

## M10 — Cloud render stub, PWA, privacy review
- [ ] `RenderProvider` interface with `MockRenderProvider` only; gated by the cloud-render consent
- [~] PWA offline
- [ ] (V) No network request containing a photo without level-2 consent (runtime test); main-flow Playwright green; accessibility pass

## M11 — Client app completion (PRD §5.10)
- [~] Client app and file exchange from the v1 kit
- [ ] New simulation, chosen options and consent-gated before/after photos in the package; package version bump, v1 still parsed
- [ ] (V) Round trip doctor → client → doctor without duplicate messages; nothing from F10.6 in the package

## Open items that need a person
- `TODO(clinical)`: every filler volume range, off-label toxin dose, onset/duration/downtime figure and the `allowed()` age table are drafts (PRD §7.2) until a senior physician confirms them
- Licence review: MD Codes™ name and content, grading-scale names (WSRS, MFVDS, Merz, Allergan), MediaPipe model card
- Legal review of the decision-support status before any real patient use
- Trademark and domain check for the name نوا (NEVA)
- Test photos for M1: 4–5 synthetic or own frontal photos in `test-assets/` (git-ignored); only one is there now
- Known gap in the v1 code: the file-exchange format id is still `tanasob/…` (kept for compatibility; revisit in M11)
