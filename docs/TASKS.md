# Milestones — PRD 2.0

Source: docs/PRD.md §13 (M0–M11) and prompts/SUPERPROMPT.md. One milestone at a time: short plan → wait for
«ادامه» → build → verify → report in ≤ 10 lines → commit `feat(Mx): ...` (no push).

Legend: [ ] todo · [x] done and verified · [~] exists from the v1 kit, must be reworked to the v2 spec · (V) acceptance check

Status 2026-11-13: **M0 and M2 done. M1 built, waiting for the owner's check of the regions by eye.** Next: **M3**, which may start only after M1 is confirmed.

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
- [ ] (V) Owner confirms all 16 regions by eye on 5 **neutral frontal** photos. **M3 does not start before this.** Photos within the pose limit and neutral: `20261112_230515` only. Close: `20261114_001811` (pitch 10°), `20261114_001749` (tilt 13°, yaw 6°). Not usable as frontal: `20261114_001802` (pitch 21°), `20261114_001815` (smile), the four 45° views, `portrait.jpg` (smile)

Open points from M1:
- Mesh indices outside PRD appendix A are now used for the nasolabial fold and the nostrils (owner asked for more accuracy). They are listed in `src/engine/landmarks.ts`, in PRD appendix A and on the debug page. The other lateral regions (cheek, marionette, jowl, masseter, temple, crow's feet) are still placed geometrically
- The hairline search compares colours, so it can stop early on a strongly shadowed forehead and run past the hairline on a shaved or bald head (capped at 0.75 face units above the brows). The debug page has a switch to compare with and without it
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
- Stored photos keep up to 1600 px on the long side; the image engine will work on a ≤ 1280 px copy (M3)
- Automatic deletion after the retention period is still not built (the setting exists and says so)
- The IndexedDB database is still named `tanasob`; renaming would orphan existing data

## M3 — Band smoothing
- [ ] Three-pass separable box blur, band split, per-region masks, protection mask (eyes, brows, nostrils, lips), Web Worker
- [ ] (V) Three effect types work; eyes and lips stay sharp; skin texture remains; unit test: synthetic dark line loses ≥ 60 % contrast, no pixel changes outside the mask

## M4 — Warp and before/after slider
- [ ] Inflate and vector operators summed into one displacement field; per-change toggle, slider, mirror, "match sides"; vertical before/after slider
- [ ] (V) Re-render < 50 ms on a mid-range phone; no tearing at the face edge; zero strength returns the input

## M5 — Grading and target age
- [ ] Automatic 0–4 grade with confidence for the 16 concerns; doctor confirms, edits or rejects
- [ ] Target age: same age / ~5 / ~10 years younger; `allowed()` and `intensity` from PRD §5.3; 85 % ceiling
- [ ] (V) Unit tests for `allowed` and `intensity`; changing the target updates the sliders

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
