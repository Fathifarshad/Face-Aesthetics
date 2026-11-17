# Milestones — PRD 2.0

Source: docs/PRD.md §13 (M0–M11) and prompts/SUPERPROMPT.md. One milestone at a time: short plan → wait for
«ادامه» → build → verify → report in ≤ 10 lines → commit `feat(Mx): ...` (push only when the owner asks).

Legend: [ ] todo · [x] done and verified · [~] exists from the v1 kit, must be reworked to the v2 spec · (V) acceptance check

Status 2026-11-17: M0–M11 built; the owner reviewed the whole app on 2026-11-17 and approved every milestone.
Release 1.0 (2026-11-17, below): clinical sign-off recorded, Android APKs, user guides. Still open: render time on a
real phone, and the licence, legal and trademark checks (the clinic's own, see the last section).
Finished work (v1 kit table, M0–M5 in full) is in `docs/TASKS-done.md`; read it only when you need the history.

## Open items from M3–M5

### From M3
- [~] Render time measured in desktop Chromium with Pixel 7 emulation (worker, 18 slider moves per photo): median 2.6–6.0 ms, max 13.3 ms on four photos. Still to measure on a real mid-range phone (open `/#/doctor/case/<id>/simulate`, read `data-render-ms` on the "after" canvas)
- [x] Owner note 2026-11-13/14: the old « ساخت شبیه‌سازی » button was barely visible. Its page (AgePage) was removed in M5; the old engine `src/simulation` was deleted in the v1 cleanup (2026-11-17). The owner approved the new simulation page

### From M4
- [x] (V) Owner checks the shape changes again on `test-results/simulate/review.html` («+ فرم و حجم») — owner approved 2026-11-17
- [ ] (V) Re-render < 50 ms on a real mid-range phone: not measured yet (open `/#/doctor/case/<id>/simulate`, read `data-render-ms` on the "after" canvas). Desktop numbers in docs/TASKS-done.md (M4) leave ~2.5× headroom for smoothing moves
- Note: the eye-bag bulge is not flattened; PRD §6 gives the under-eye concern S only. A warp for it would need an owner decision

### From M5
- [x] (V) Owner looks at the grading page and the age target on a real case — owner approved 2026-11-17
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
- [x] (V) Owner look on `test-results/simulate/review.html` → «MD Codes (M5b)» (picture, zones, zoom) and on the page — owner approved 2026-11-17

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
- [x] (V) Owner look on `test-results/simulate/review-m5c.html` (each family alone, zones, zoom) and on the page — owner approved 2026-11-17
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
- [x] (V) Owner look: plan page (`/#/doctor/case/<id>/plan`) and the option chips on the simulation page — owner approved 2026-11-17
- Open: the plan tiers (F5.4) are stored but do not filter options yet; in MD Codes mode the site sliders ignore the
  chosen option (M7: the MD Codes layer only for filler options); the v1 cost section left the plan page (M7)

## M7 — MD Codes, estimates, cost
Owner decisions 2026-11-16 (plan approved with «ادامه», built 2026-11-16):
- Syringe size and vial units are set in the admin pricing tab (defaults 1 mL and 100 U, editable); plan totals count
  syringes and vials from them (rounded up)
- MD Codes mode shows a range per code: 0 to 0.3 mL × slider (T1, T2 and Jw1 up to 0.5 mL; PMID 32445044 bolus caps,
  PRD §7.1), badge «تأییدنشده»
- Plan: `src/data/estimates.ts` (PRD §5.7 formula, ranges with unit and per side/total, rounding 0.1 mL / 2 U; no base →
  «پزشک وارد کند»); toxin numbers only for OnabotulinumtoxinA (brand asked in the plan); tariff per filler type, toxin
  unit, thread, device session and currency; cost = estimate × tariff, else the M6 cost tier; doctor override with
  «ویرایش پزشک»; MD Codes layer only for chosen filler options; warning codes (G, N, Tt, T, NL1; F5.7, draft) in the risk
  colour with «کانولا توصیه می‌شود»
- [x] MD Codes layer for chosen filler options only (built 2026-11-16): the MD Codes page lists the codes of the chosen
  filler options with warning codes (`WARNING_CODES` in `mdCodes.ts`: G, N, Tt, T1–T2, NL1; draft) in the risk colour
  with «کانولا توصیه می‌شود», the source and the F6.4 text. On the simulation page (mode B) a family is off when the doctor
  explicitly chose a non-filler option for its concern (`familiesOff` in `simDefaults.ts`); that concern then keeps its own
  slider and effect as in mode A. Defaults without an explicit choice keep the reviewed M5b–M5c picture. Each code row
  shows «0 تا X mL» (bolus cap × slider, draft) and the warning tag
- [x] `src/data/estimates.ts`: PRD §5.7 formula (grade factor, 0.1 mL / 2 U), per side or total, sides apart when they
  differ; label doses shown as on the label and never scaled; toxin numbers only after the doctor picks
  OnabotulinumtoxinA on the plan page (`plans.toxinBrand`); no base → «پزشک وارد کند». Intensity = the concern's mode-A
  slider capped by the option. Tariff in the admin pricing tab (`settings.tariff`: currency, filler per mL by type
  structural / soft / lip, toxin unit, thread, session per modality, syringe mL, vial units; replaces the v1 price list).
  Cost = estimate × tariff, else the cost tier; cost sorting uses the tariff only when every option of a concern has a
  cost. Doctor override with «ویرایش پزشک» (`plans.estOverrides`, audited). Plan totals: filler mL and syringes, toxin U
  and vials (rounded up), threads, sessions, cost
- [x] (V) Unit tests `estimates.test.ts`, `planOptions.test.ts` (families off); e2e: brand, estimate, doctor edit and
  totals in `grading.spec.ts`, code range and warning codes in `simulate.spec.ts`
- [x] (V) Owner look: plan page (estimates, brand, «ویرایش پزشک», totals), admin pricing tab, mode-B code rows — owner approved 2026-11-17
- Open: in mode B the plan still estimates from the mode-A concern sliders (code ranges are shown only beside the codes);
  estimates are not yet in the report or the client package (M9, M11; doctor approval first)

## M8 — Before/after gallery and consent
Plan approved by the owner 2026-11-16 («اصلاح که کردی ادامه بده»), built 2026-11-16. Owner decision in the plan:
level 3 «فقط داخلی» also covers the patient's own copy (client package, report), so declining teaching use still
gives the patient their photos.
- [x] Consent (PRD F8.3): Dexie v3 table `consents` per patient; signature encrypted like the sign-off
  (`images.ts`: `listConsents`, `addConsent`, `revokeConsent`, audited under `patient:<id>`). `ConsentPanel` card
  per level (name, date, touch signature; level 3 use internal / education / public and «پوشاندن چشم»), revocation with
  a warning that copies already given are not recalled, history kept. Page `/doctor/patient/:id/consent`; level 1 on
  the intake page replaces the v1 photography / analysis / storage / educational switches (the client-app switch
  stays); capture is blocked without level 1. Deleting a patient deletes their consents and audit
- [x] Share gate `src/data/consentGate.ts` is the only rule: client package (photos and the simulation), report photos
  and the gallery file ask `canShare`; revoked = none from that moment
- [x] Photo sets per PRD §8 (`services.ts`: base, upper-face toxin, mid/lower filler, lips, jaw and neck, full
  analysis; v1 ids mapped); new views «بستن محکم چشم», «نمای نزدیک لب», «سر پایین». "After" photo time per chosen
  modality (`src/data/photoProtocol.ts`, PRD §8, draft)
- [x] Framing (F8.2): ghost overlay as before; the confirm dialog warns when the "after" photo's eye line differs from
  the "before" one (`src/capture/align.ts`, technical tolerances 10 % / 6 % / 4°)
- [x] Gallery page: pairs per view, untaken views in one line, "hidden" tag without consent, before/after file aligned
  on the eye corners with dates and the eye bar (`galleryExport.ts`), purposes limited to the signed use, audited
- [x] Compare: third mode «شبیه‌سازی در برابر نتیجهٔ واقعی» (after photo aligned to the before frame, slider)
- [x] (V) Unit: `consentGate.test.ts`, `align.test.ts`, `capture.test.ts`; e2e `gallery.spec.ts` (level 1 blocks
  capture; misframed after photo flagged; no file without level 3; internal only offers internal; masked export;
  revocation closes it; simulation vs real result)
- [x] (V) Owner look: consent cards (intake, gallery, patient page → «رضایت‌نامه‌ها»), gallery file, compare mode — owner approved 2026-11-17
- Open: level 2 is recorded only (used in M10). The client app does not yet show consented photos differently (M11).
  The report (M9) shows a line instead of photos without level 3

## M9 — Report
Plan approved by the owner 2026-11-16 («ادامه»), built 2026-11-16. Owner decisions in the plan: (a) any change after
the sign-off makes it stale; (b) cost is always in the patient report, no cost column without a tariff.
- [x] One source for the plan's numbers: `planView` / `estimateFormat` in `src/features/doctor/planEstimates.ts`, used
  by the plan page and the report (they cannot disagree)
- [x] Report (F9.1): clinic branding, before photos and the saved simulation (level 3 only; images no longer cropped, so
  the burned-in label is never cut), items table (area, option, MD Codes, volume/dose range, cost) with totals, the
  «تأییدنشده» / «ویرایش پزشک» tags, doctor's note (`plans.reportNote`), sessions, disclaimer; a line when no simulation
  is saved. Empty v1 findings section hidden
- [x] Approval (F9.2): `src/db/approval.ts` stamps the approved content (age, intake, grades, simulation state, plan
  row with note, saved simulation id, tariff). The report, the print route and the client package (`toPtCase`) need a
  fresh stamp; a stale one shows a warning, puts the case back to «منتظر تأیید» (unlocks the simulation page) and asks
  for a new signature. v1 sign-offs without a stamp count as stale
- [x] Fixed on the way: choosing a tier on the plan page dropped the toxin brand and the doctor's estimates
- [x] (V) Unit `approval.test.ts`; e2e `report.spec.ts` (no report unsigned; same numbers as the plan page; label band
  on the report's simulation image; note printed; change after signing → stale, blocked, re-sign restores)
- [x] (V) Owner look: report page (note, stale warning) and the printed report (fa and en) — owner approved 2026-11-17

## M10 — Cloud render stub, PWA, privacy review
Plan approved by the owner 2026-11-16 («ادامه», including the test-only dependency `@axe-core/playwright` 4.14.0,
MPL-2.0), built 2026-11-16.
- [x] `RenderProvider` (`src/render/provider.ts`) with `MockRenderProvider` only (`src/render/mock.ts`, no network; returns
  the browser preview, label burned in). One gate `cloudRender()`: clinic switch `settings.cloudRender` (admin → data,
  default off) and a live level-2 consent read right before the call. Result shown on the simulation page, never saved;
  audit `render.cloud` holds only provider id, mock flag and region ids
- [x] PWA: PNG icons 192/512/maskable and apple-touch-icon from `icon.svg` (`npm run icons`), manifest start_url/scope,
  PNG in the precache. Offline test on the production build (`npm run test:pwa`, `playwright.pwa.config.ts`)
- [x] Accessibility: axe-core WCAG 2.1 A/AA on 14 screens found no violation; 50 controls under 44 px fixed (switch hit
  area, option and Fitzpatrick chips, capture rules button)
- [x] (V) `e2e/privacy.spec.ts` (switch off → no button; level 1 only → refused; level 2 → mock result; revoked → refused;
  no request leaves the origin or carries a body; the watcher's own self-test); `watchNetwork` also in the main flow;
  `e2e/pwa.spec.ts` (manifest, cached model/WASM, offline analysis and simulation); `e2e/a11y.spec.ts`; unit `src/render/provider.test.ts`
- [x] (V) Owner look: admin switch and the render box on the simulation page; install on the phone — owner approved 2026-11-17 (phone install not reported yet)

## M11 — Client app completion (PRD §5.10)
Plan approved by the owner 2026-11-16 («ادامه»), built 2026-11-17. Owner decisions in the plan: (a) a newer clinic
file without photos (consent revoked, case no longer signed) removes the clinic's photos from the phone; the patient's
own progress photos stay; (b) the doctor's report note is shown in the client app as «توضیح پزشک».
- [x] Package v2 (`src/share/format.ts`): ids `neva/patient-package` and `neva/patient-reply`, version 2, files
  `neva-<code>.json` / `neva-reply-<code>.json`. v1 files (`tanasob/…`, version 1) are still read and mapped to the v2
  shape; the grade a v1 file carried is dropped on import
- [x] Content (F10.3, `toPtCase`): areas in plain words from the confirmed grades (`concernsPatient` in both
  dictionaries, no grade), the chosen option per area, sessions, aftercare, doctor's note, simulation with the label,
  only for fresh sign-offs. Photos only through `canShare` (level 3)
- [x] Client app: chosen treatment under each area, doctor's note, before/after compare per view, a notice when the
  file has no photos, readable import errors; an older clinic file than the stored one is refused (`older-package`)
- [x] Fixed on the way: doctor and client on one device overwrote each other's copy of a message (shared `messages`
  table). The client app stores its rows as `pt:<id>`; files carry the bare id; v1 rows are moved on the next import.
  A reply file's messages count only when written by the patient
- [x] (V) Unit `share.test.ts` (v1 still read, grade dropped, v2 note); e2e `client.spec.ts` (package v2; whole-file
  scan for grade, volume/dose, MD Codes, screening and cost; round trip doctor → client → doctor (imported twice) →
  client with each message once; revocation empties the photos on the phone; older file refused; no network)
- [x] (V) Owner look: client app (plan, photos, chat) after importing a file from the doctor's patient page — owner approved 2026-11-17

## Release 1.0 (owner 2026-11-17: «همه موارد توسط دکتر فتحی و دکتر نوری بازبینی و تائید شدند»)
- [x] Clinical sign-off: `src/data/clinicalReview.ts` records the review by Dr Farshad Fathi and Dr Naghmeh Nouri on
  2026-11-17. Every clinical record (volumes and doses, timings, grade thresholds and scales, age coefficients, lip
  types, MD Codes, photo timings, rank, cost tier, caps) is `verified` with that in its `source`; the values did not
  change. The «تأییدنشده» badges are tied to the records or to `reviewPending()`; setting the record back to `draft`
  shows them again. Label doses now carry their own `label` flag (status no longer means "label dose"). The plan
  page and the printed report name the reviewers (`data-clinical-review`)
- [x] Home page: «کلینیک زیبایی نوا» and the founders (Dr Farshad Fathi, Dr Naghmeh Nouri)
- [x] Android: `android/` Trusted Web Activity (androidbrowserhelper 2.5.0, Apache-2.0), two apps: «نوا» (doctor,
  `com.nevaclinic.app`, opens `#/doctor`) and «نوا — مراجع» (`com.nevaclinic.app.client`, `#/client`). Built locally
  with `scripts/build-apk.ps1`; key and toolchain outside the repo (android/README.md). APKs served from
  `public/download/` on GitHub Pages
- [ ] Full screen without the address bar: `android/assetlinks.json` must be served at
  `https://fathifarshad.github.io/.well-known/assetlinks.json` (user-site repo, needs the owner)
- [x] Guides: `scripts/make-guides.mjs` → `public/guides/NEVA-Guide-Doctors.pdf` and `NEVA-Guide-Clients.pdf`
  (screenshots `GUIDE_SHOTS=1 npx playwright test e2e/guide-shots.spec.ts`, faces blurred; QR codes `docs/guides/qr/`)

## Open items that need a person
- Clinical values: approved by the clinic's physicians on 2026-11-17 (`clinicalReview.ts`); any later change to a number goes through them again
- Licence review: MD Codes™ name and content, grading-scale names (WSRS, MFVDS, Merz, Allergan), MediaPipe model card
- Legal review of the decision-support status before any real patient use
- Trademark and domain check for the name نوا (NEVA)
- Test photos for M1: 4–5 synthetic or own frontal photos in `test-assets/` (git-ignored); only one is there now
- The IndexedDB name is still `tanasob` (renaming it would lose the data on devices already in use)
