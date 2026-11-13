# Milestones — PRD 2.0

Source: docs/PRD.md §13 (M0–M11) and prompts/SUPERPROMPT.md. One milestone at a time: short plan → wait for
«ادامه» → build → verify → report in ≤ 10 lines → commit `feat(Mx): ...` (no push).

Legend: [ ] todo · [x] done and verified · [~] exists from the v1 kit, must be reworked to the v2 spec · (V) acceptance check

Status 2026-11-13: **M0 done.** Next: **M1**.

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
- [ ] `src/engine/faceFrame.ts`, `landmarks.ts` (PRD appendix A sets), `regions.ts` (16 regions, built geometrically)
- [ ] Debug page: every region drawn with colour and name over the photo, anchor indices written out
- [ ] Unit tests: frame is invariant to image rotation and scale; regions mirror left/right
- [ ] (V) On 5 test photos all 16 regions confirmed by eye by the owner; screenshots recorded. **M3 does not start before this**

## M2 — Records, encryption, app lock
- [~] Patient record and Dexie schema (reconcile with PRD §9: internal id, Fitzpatrick optional)
- [ ] Photos encrypted in IndexedDB (AES-GCM, key derived from the doctor's passphrase); EXIF stripped on import; working copy ≤ 1280 px
- [ ] App lock; auto-lock after 5 minutes idle; "delete record completely"
- [ ] (V) Photo bytes in IndexedDB are ciphertext; deleting a record leaves nothing behind

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
