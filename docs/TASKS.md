# Milestones — Phase 1

Rules: one milestone per session (`/clear` between). Plan first, then build. Tick an item only after its
verification passed and the evidence was shown. Suggested model/effort per milestone is for the human operator.

Legend: [ ] todo · [x] done · (V) = verification step

## M0 — Scaffold (model: opusplan · effort: high)
- [ ] Vite + React + TS strict, React Router, Tailwind with BRAND tokens, Vazirmatn self-hosted, RTL root
- [ ] i18n dictionaries fa/en + `t()` helper with type-safe keys; language switch in Settings
- [ ] ESLint + Prettier; Vitest; Playwright (390x844 mobile project)
- [ ] `npm run check` (tsc --noEmit + eslint + vitest run); `npm run dev:https` for phone camera testing
- [ ] vite-plugin-pwa with offline cache of app shell, fonts and `/models/face_landmarker.task`
- [ ] `.gitignore` includes `test-assets/`, `*.task` download script `scripts/fetch-model.mjs`
- [ ] (V) `npm run check` green; Playwright smoke test opens app in fa RTL; screenshot attached

## M1 — Landmark engine + Inspector (model: opus · effort: high)
- [ ] `src/analysis/landmarker.ts`: init FaceLandmarker (IMAGE + VIDEO), GPU with CPU fallback
- [ ] `src/analysis/pose.ts`: yaw/pitch/roll from transformation matrix; sign convention documented + tested
- [ ] `src/analysis/landmarks.ts`: named indices from ANALYSIS_SPEC §1.1
- [ ] Dev page `/dev/inspector`: load photo → draw all 478 indices with zoom; highlight named landmarks
- [ ] (V) Human check: operator confirms each named landmark on 2 test photos; record result in `docs/LANDMARKS_VERIFIED.md`; fix indices that are wrong

## M2 — Guided capture (model: opusplan · effort: high)
- [ ] Camera (getUserMedia, rear/front switch, highest resolution available), live mask overlay
- [ ] Pose gating and QC checks from ANALYSIS_SPEC §2 with live checklist and fix hints (fa/en)
- [ ] 11-view stepper with progress dots, retake, skip (marked), gallery upload with same QC
- [ ] Ghost overlay in follow-up mode
- [ ] Manual mode for profile views when detection fails
- [ ] (V) Unit tests for QC functions; e2e with fake camera (Playwright `--use-file-for-fake-video-capture` or injected image); manual phone test checklist in PR description; screenshot vs `Capture.dc.html`

## M3 — Data, intake, consent (model: sonnet · effort: high)
- [ ] Dexie schema per PRD §7 with migrations; repositories; audit log
- [ ] Patients list (Main) with search, status chips, counters; new case flow
- [ ] Intake questionnaire (SAFETY §2), consent toggles, age < 18 stop, BDD placeholder (doctor-only result)
- [ ] (V) Repository unit tests; e2e: create patient → intake → consent → reaches capture; screenshot vs `Main.dc.html`

## M4 — Analysis engine (model: opus · effort: xhigh for planning, high for building)
- [ ] Calibration (iris → mm), roll correction, midline fit
- [ ] All frontal metrics ANALYSIS_SPEC §4; profile metrics §5 from doctor-placed points
- [ ] `norms.ts` with defaults, tolerances, `reviewed:false`; severity suggestion
- [ ] Synthetic fixtures + tests per ANALYSIS_SPEC §9 (exact, roll-corrected, edge case)
- [ ] (V) `npm run check` green with coverage ≥ 95 % for `src/analysis/`; golden test on local photos stable ±2 %

## M5 — Analysis UI (model: sonnet · effort: high)
- [ ] Image panel with toggles (landmarks, thirds/fifths, midline, heat zones); draggable landmarks with undo
- [ ] Tabs and finding cards (confirm / edit severity / reject with reason), persisted + audit-logged
- [ ] Clinician grading UI for ANALYSIS_SPEC §6 (scale name, 0–4, note), Fitzpatrick, Glogau
- [ ] Profile point-placement tool with live angles
- [ ] (V) e2e: analyze fixture photo → confirm 2, edit 1, reject 1 → reload → state persists; screenshot vs `Analysis.dc.html`

## M6 — Age (model: sonnet · effort: medium)
- [ ] Actual age, apparent age (doctor), target slider (actual → actual − 15) + quick picks
- [ ] Before/after panel with Phase 2 placeholder; view switch; regional age chips (manual)
- [ ] (V) Unit test: target gap → default tier; screenshot vs `Age.dc.html`

## M7 — Treatment plan + MD Codes view (model: opus · effort: high)
- [ ] `treatments.ts` from TREATMENTS.md; rules engine (tiers, priority, sequencing, caps, contraindications) as pure functions
- [ ] Plan UI: tier switch, session timeline, options per finding with tags and source ids, cost estimate
- [ ] MD Codes screen: generic zones from landmarks, empty-safe code table from `mdcodes.json`, danger-zone overlay, emergency page link
- [ ] Vascular-occlusion page shell rendering clinical-lead-provided markdown (`content/emergency.fa.md`, `.en.md`)
- [ ] (V) Engine unit tests: contraindication hard block, soft flag, sequencing order, cap warning, tier filter; screenshots vs `Plan.dc.html`, `MDCodes.dc.html`

## M8 — Sign-off and report (model: sonnet · effort: high)
- [ ] Sign-off checklist + signature pad; settings for doctor/clinic branding
- [ ] Report route optimized for print (A4), fa/en, Jalali + Gregorian, technical appendix toggle
- [ ] Consent summary page generated from the plan
- [ ] Follow-up: recapture, compare (side-by-side + slider), metric deltas, GAIS
- [ ] (V) Playwright PDF render of report in fa and en without overflow; screenshot vs `Report.dc.html`

## M9 — Security, privacy, polish (model: opus · effort: high)
- [ ] App PIN, PBKDF2 key, AES-GCM encryption of photos and records; lock on background/timeout
- [ ] Retention auto-delete, export/delete patient
- [ ] Network-blocked test after load (offline works, no outbound calls)
- [ ] Accessibility pass (labels, contrast, focus), Lighthouse PWA ≥ 90
- [ ] (V) Security unit tests (wrong PIN fails decrypt, deleted data unrecoverable); Lighthouse report

## M10 — Independent review (model: opus · effort: high)
- [ ] Run `clinical-safety-reviewer` agent on the whole app; fix correctness/safety findings
- [ ] Run `/code-review` on the full diff; fix real bugs only
- [ ] Update README with setup and known limitations
- [ ] (V) all checks green; review reports saved in `docs/reviews/`
