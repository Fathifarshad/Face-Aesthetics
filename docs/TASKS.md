# Milestones — PRD 2.0

Source: docs/PRD.md §13 (M0–M11) and prompts/SUPERPROMPT.md. One milestone at a time: short plan → wait for
«ادامه» → build → verify → report in ≤ 10 lines → commit `feat(Mx): ...` (push only when the owner asks).

Legend: [ ] todo · [x] done and verified · [~] exists from the v1 kit, must be reworked to the v2 spec · (V) acceptance check

Status 2026-11-16: M0–M3 done; M4, M5, M5b (MD Codes filler mode), M5c (full MD Codes set) and M6 (knowledge base,
sorting, option → image) built, waiting for the owner's look. Next: M7.
Finished work (v1 kit table, M0–M5 in full) is in `docs/TASKS-done.md`; read it only when you need the history.

## Open items from M3–M5

### From M3
- [~] Render time measured in desktop Chromium with Pixel 7 emulation (worker, 18 slider moves per photo): median 2.6–6.0 ms, max 13.3 ms on four photos. Still to measure on a real mid-range phone (open `/#/doctor/case/<id>/simulate`, read `data-render-ms` on the "after" canvas)
- [ ] Owner note 2026-11-13/14: the effect of the old « ساخت شبیه‌سازی » button on the target-age page was barely visible. The old engine (`src/simulation`) is untouched and still used there; the new page is the replacement. Check visibility of the new effect on real photos at the default 60 % and decide whether the default or the cap should be higher

### From M4
- [ ] (V) Owner checks the shape changes again on `test-results/simulate/review.html` («+ فرم و حجم»)
- [ ] (V) Re-render < 50 ms on a real mid-range phone: not measured yet (open `/#/doctor/case/<id>/simulate`, read `data-render-ms` on the "after" canvas). Desktop numbers in docs/TASKS-done.md (M4) leave ~2.5× headroom for smoothing moves
- Note: the eye-bag bulge is not flattened; PRD §6 gives the under-eye concern S only. A warp for it would need an owner decision

### From M5
- [ ] (V) Owner looks at the grading page and the age target on a real case
- Open: thresholds and age coefficients are drafts for a senior physician; the index is sensitive to lighting, a smile, hair and
  clothing (neck). Motion photos (PRD §8) are not used for grading yet

## M5b — MD Codes filler mode (owner decisions 2026-11-16)
On the simulation page a two-way switch; exactly one mode is on, so no area gets volume twice. Smoothing (lines, folds,
skin) stays in both modes.
- Mode A «حجم‌دهی بر اساس ناحیه»: the current shape and volume sliders per concern (midface volume, chin, jaw and jowl,
  masseter, temple, lips, brow); defaults from confirmed grades + target
- Mode B «حجم‌دهی فیلر بر اساس MD Codes»: one slider per injection-site family, per side with mirror: Ck1, Ck2, Ck3 (three
  separate cheek sliders, owner: yes), T, Tt, NL, M, C, Jw, Lp, E. Each slider fills only its own site
- Owner rule: when two nearby sites both get volume, blend the gap between them so the result reads as one smooth,
  continuous fill, never two separate bumps (design like a facial aesthetic designer, PRD F4.12)
- On the photo only an approximate shaded zone with the code name; no point, depth or tool (PRD §5.6). Fixed text under it:
  «MD Codes™ نشان تجاری است. جانمایی تقریبی است و راهنمای تزریق نیست.» Only the code family until a senior physician enters
  the PMC8012343 table
- Switching A → B: each MD Codes slider starts from its matching mode-A value (for example midface volume 60 % → Ck1–Ck3
  60 %). Switching back restores mode A as it was; each mode's settings are stored separately (`simStates`)
- Built now, before M6 (owner: yes). Volumes in mL and cost join these sliders in M7
- Tt (owner 2026-11-16, plan approved): in mode B the under-eye shadow lift moves to the Tt slider; no volume warp
  near the eye, and the «گودی زیر چشم» slider is hidden there. Masseter (toxin, no family) stays in both modes
- [x] Built 2026-11-16: `src/data/mdCodes.ts` (sites, no clinical values); `warp.ts` Ck1–Ck3 operators and bridges
  (`BRIDGES`; each bridge gets the smallest inflate that leaves the gap unsqueezed, measured on the face, at the weaker
  of its two strengths); `pipeline.ts` `SiteChange`, `operatorStrength`, site zones; `simStates.mode` and `siteOverrides`
  (no Dexie version change); page switch, MD Codes rows, shaded zones, F6.4 text. Unit tests: `warp.test.ts` (one mode per
  operator, no groove between filled neighbours, no fold in either mode), `mdMode.test.ts`. e2e: `simulate.spec.ts` (M5b)
- [ ] (V) Owner look on `test-results/simulate/review.html` → «MD Codes (M5b)» (picture, zones, zoom) and on the page

## M5c — Full MD Codes set (owner request 2026-11-16, built 2026-11-16)
Owner: the MD Codes mode must have the standard codes, not one slider per family (Ck4–Ck5, C1–C6, T1–T2, Jw1–Jw5, …).
Source found: de Maio, Aesthetic Plast Surg 2020;45(2):690–709, PMC8012343, Table 3, licence CC BY 4.0 (attribution
required; the MD Codes™ name stays a trademark, licence review still open). 51 codes with their anatomical names:
Ck1 zygomatic arch, Ck2 zygomatic eminence, Ck3 anteromedial cheek, Ck4 lateral lower cheek/parotid area, Ck5 submalar/buccal
area; T1 anterior temple, T2 posterior temple; C1 labiomental angle, C2 chin apex, C3 anterior chin, C4 anterior chin/soft
tissue pogonion, C5 lateral lower chin, C6 lateral chin; Jw1 mandible angle, Jw2 pre-auricular area, Jw3 mandible body, Jw4
lower prejowl, Jw5 lower anterior chin; F1 medial, F2 lateral, F3 central forehead; O1 central, O2 lower, O3 upper lateral
orbital; E1 eyebrow tail, E2 centre, E3 head; Tt1 central, Tt2 lateral, Tt3 medial infraorbital; G1 lateral, G2 central
glabella; NL1–NL3 upper, central, lower nasolabial fold; M1–M3 upper, central, lower marionette line; Lp1 vermilion body,
Lp2 Cupid's bow, Lp3 lip border, Lp4 medial tubercle, Lp5 lateral tubercles, Lp6 oral commissure, Lp7 philtrum column, Lp8
perioral lines; N1 anterior nasal spine, N2 columella, N3 frontonasal angle, N4 bony dorsum, N5 cartilaginous dorsum.
Only names and approximate zones are used; the table's depth, tool and volume are not shown (PRD F6.2).
Plan approved 2026-11-16:
- [x] All 51 codes in `src/data/mdCodes.ts` (13 families) with Persian name (Claude's translation, `// TODO(clinical)` for a
  physician), English name from Table 3, `status: 'draft'`, source shown on the page with the «تأییدنشده» badge (CC BY)
- [x] Page: one family slider with switch and mirror that opens («+») into one row per code, each with its own switch,
  slider and mirror (two-sided codes). A code follows its family until moved; it is on when its family and itself are on
  (`simStates.codeOn`, else `starts`); switching a code on switches its family on; a family switched on with no code on
  switches all its codes on. M5b keys still read (T, E, Tt, NL, Lp, M, C, Jw are families; Ck1–Ck3 codes)
- [x] Each code changes only its own zone: reshaping codes have their own operators (`warp.ts`: `cheekSites`, `foldCodes`,
  `chinCodes`, `jawCodes`, `lipCodes`, `noseCodes`, temple and brow); F, G, O, Tt and Lp8 smooth their part of the concern
  region (`src/engine/mdZones.ts`: parts add up to the region with soft seams). Mode-A operators are unchanged except the
  marionette (below). Bridges between codes: `BRIDGES` (search target 0.99, up to 0.03). Eyes never move; only E3 reaches a
  brow head (`mdCodes.test.ts`)
- [x] Starting state of mode B = the M5b picture: the codes of the M5b sites start on (Ck1–Ck3, T1–T2, E1, E3 per owner,
  Tt1–Tt3, NL1–NL3, Lp1, M1–M3, C2–C3, Jw1, Jw4); every other code starts off. F, G, O and N families start off: the
  forehead, glabella and crow's-feet lines are still smoothed by their concern sliders in mode B (smoothing stays in both
  modes), and F/G/O add their own smoothing only when the doctor switches them on
- [x] Lip codes are fine touches on top of Lp1 (shares in `LIP_CODES`), so all lip codes together cannot fold the lip
- [x] Owner review 2026-11-16 (relayed by the M5b session): the mouth corner curled into a V in MD Codes mode. The marionette
  operator now supports below the corner (mode A too); M1–M3 and Lp6 sit below the commissure with a wide radius
- [x] Unit: `src/engine/mdCodes.test.ts`, `warp.test.ts` (every reshaping code, both sides), `mdMode.test.ts`. e2e:
  `simulate.spec.ts` (M5b, M5c), per-photo images: each family alone, defaults, all 51 codes
- [x] Owner review 2026-11-16: «با زدن یک دکمه، جاهای دیگر هم تغییر می‌کند» (T on 20261114_001811). Measured: outside the
  temples every pixel is unchanged (face colour means equal to 0.1); the side-by-side view makes the second picture look
  lighter. The review page now has a difference map and an in-place before/after toggle, and `simulate.spec.ts` checks for
  every family on every photo that nothing changes outside its zones (+ 0.08 × width margin)
- [ ] (V) Owner look on `test-results/simulate/review-m5c.html` (each family alone, zones, zoom) and on the page
- Open: on a turned head (20261114_001749) Ck4 and Ck5 sit close together on the far side; zones follow the photo, so a
  frontal photo per PRD §8 keeps them apart. Persian names and the code placement need a senior physician
- Owner decisions on the three questions:
  1. Nose N1–N5: kept, with a switch to turn them off (no nose concern in PRD §6; vascular high-risk area)
  2. F, G, O codes: kept as smoothing of their own zone. Later: a toxin option the doctor can switch on to smooth lines
     with toxin (UI text says «توکسین», never «بوتاکس»)
  3. E3 (brow head): kept and working; the doctor turns it off when not wanted. This overrides the earlier "brow heads never
     change" rule only for the E3 slider; every other operator still leaves the brow head alone

## M6 — Knowledge base and sorting
Owner decisions 2026-11-16 (plan approved): result rank from the PRD §6 default order; cost tier from the modality
(toxin < skin booster, PN, peel < filler < biostimulator < thread and devices); image caps without a PRD figure from the
modality (toxin and filler 0.85, biostimulator and thread 0.6, RF, HIFU and laser 0.5, skin booster, PN and peel 0.35).
All three stay `draft`; M7 replaces the cost tier with the clinic tariff.
- [x] `src/data/treatmentOptions.ts`: 16 concerns, 44 options, every PRD §6 field plus `status`/`source`. Only the four
  label toxin doses are verified; timings from the PRD §7.2 draft table (none for skin booster, PN, peel). No tool,
  depth or technique (the v1 «how» text is not used)
- [x] `src/data/optionSort.ts`: five sort keys (F5.2), «اول حمایت، بعد چین» from midface grade 2 (F5.6), session order
  (F5.5). Risk tags F5.7 (vascular areas for filler/biostimulator, Fitzpatrick for RF, HIFU, laser)
- [x] Choice stored in `simStates.options` (no Dexie version change), shared by the simulation and plan pages. The option
  caps its slider and sets the effect (S smooth only, W warp only via `Change.effect: 'warp'`, SW both)
- [x] Plan page rebuilt on the new data; the v1 intake checks (pregnancy, infection, allergy block; the rest warn) are
  kept through `optionScreening.ts`. The client package sends the M6 plan for cases with confirmed grades (v1 plan otherwise)
- [x] Tests: `treatmentOptions.test.ts`, `planOptions.test.ts`; e2e in `simulate.spec.ts`, `grading.spec.ts`, `smoke.spec.ts`
- [ ] (V) Owner look: plan page (`/#/doctor/case/<id>/plan`) and the option chips on the simulation page
- Open: the plan tiers (F5.4) are stored but do not filter options yet; in MD Codes mode the site sliders ignore the
  chosen option (M7: the MD Codes layer only for filler options); the v1 cost section left the plan page (M7)

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
