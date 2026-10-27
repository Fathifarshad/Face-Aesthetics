# Milestones — Phase 1

Rules: one milestone per session (`/clear` between). Plan first, then build. Tick an item only after its
verification passed and the evidence was shown. Suggested model/effort per milestone is for the human operator.

Legend: [ ] todo · [x] done · [~] built, verification step still open · (V) = verification step

Status 2026-10-27: a runnable prototype covering M0–M8 + M11–M12 was built in one session at the owner's request
(evidence: `npm run check` green — 81 unit tests; Playwright e2e of the full doctor flow at 390×844 with
screenshots in `test-results/screens/`). Items needing a human, a real phone or the clinical lead stay open.

## M0 — Scaffold
- [x] Vite + React + TS strict, React Router (HashRouter), Tailwind with BRAND tokens (black & gold), Vazirmatn self-hosted, RTL root
- [x] i18n dictionaries fa/en + typed `useT()`; language switch in Settings and headers
- [x] ESLint + Prettier; Vitest; Playwright (390x844 mobile project)
- [x] `npm run check` (tsc -b + eslint + vitest run); `npm run dev:https` (basic-ssl) for phone camera testing
- [x] vite-plugin-pwa with offline cache of app shell, fonts, MediaPipe WASM and `/models/face_landmarker.task`
- [x] `.gitignore` includes `test-assets/`, model, copied WASM; `scripts/fetch-model.mjs`, `scripts/copy-wasm.mjs`
- [x] (V) `npm run check` green; Playwright smoke test opens app in fa RTL; screenshot attached

## M1 — Landmark engine + Inspector
- [x] `src/analysis/landmarker.ts`: FaceLandmarker (IMAGE + VIDEO), GPU with CPU fallback, local WASM
- [x] `src/analysis/pose.ts`: yaw/pitch/roll from the transformation matrix; decomposition unit-tested (round trip)
- [x] `src/analysis/landmarks.ts`: named indices from ANALYSIS_SPEC §1.1
- [x] Dev page `/dev/inspector`: load photo → draw all 478 / named points + coordinates table
- [ ] (V) Human check: confirm each named landmark on 2 test photos → `docs/LANDMARKS_VERIFIED.md`; confirm yaw sign (45° R/L currently checks |yaw| only)

## M2 — Guided capture
- [x] In-app camera (getUserMedia, front/rear switch), face-oval guide, live pose readout, shutter gated by pose (manual for profiles/submental or if detector fails)
- [x] QC checks from ANALYSIS_SPEC §2 with pass/fail and fix hints (fa/en) on a confirmation screen
- [x] Per-view stepper with retake, gallery upload with the same QC, "use anyway" → low quality
- [x] Ghost overlay (35 %) of the Before photo in the After section
- [~] Blur/backlight thresholds are placeholders — calibrate on real photos
- [ ] (V) Manual phone test (Android Chrome + iOS Safari) over `npm run dev:https`

## M3 — Data, intake, consent
- [x] Dexie schema per PRD §7 (+ code, services, phase, simulations, messages, client tables); repositories; audit log
- [x] Patients list with search (name / file no / patient code), status chips, counters; new case flow
- [x] Intake questionnaire (SAFETY §2), consent toggles, age < 18 stop, BDD placeholder (doctor-only)
- [x] (V) e2e: create patient → intake → consent → capture

## M4 — Analysis engine
- [x] Calibration (iris → mm), roll correction, midline fit
- [x] All frontal metrics ANALYSIS_SPEC §4 with exact, roll-corrected and missing-iris tests
- [x] `norms.ts` with defaults, tolerances `reviewed:false`; severity suggestion; proxy pre-selection (tear trough, nasolabial, marionette, lips) with low confidence
- [ ] Profile metrics §5 (doctor-placed points) — not built yet
- [ ] (V) coverage ≥ 95 % for `src/analysis/`; golden test on local photos ±2 %

## M5 — Analysis UI
- [x] Image panel with toggles (landmarks, thirds/fifths, midline, heat zones)
- [x] Tabs and finding cards (confirm / edit severity / reject with reason), persisted + audit-logged
- [x] Clinician grading for ANALYSIS_SPEC §6 (scale name, 0–4), Fitzpatrick, Glogau
- [ ] Draggable landmarks with undo; profile point-placement tool
- [x] (V) e2e: grade findings → persists across reload

## M6 — Age
- [x] Age-band buttons, actual age, apparent age (doctor), target slider (actual → actual − 15) + quick picks
- [x] On-device approximate simulation (warp + shadow softening + skin smoothing) with strength slider and before/after slider; saved per case
- [x] (V) Unit tests: target gap → default tier; simulation plan scales with severity, zero at no gap

## M7 — Treatment plan + MD Codes view
- [x] `treatments.ts` from TREATMENTS.md; rules engine (tiers, priority × age factor, sequencing, high-risk cap, contraindications) as pure functions
- [x] Plan UI: tier switch, per-finding regional analysis + client wording, options with technique, tags, flags, source ids, combined approach, session timeline, cost estimate
- [x] MD Codes screen: generic zones, empty-safe code table, approximate vessel overlay, emergency link
- [x] Emergency page renders `content/emergency.{fa,en}.md` when the clinical lead provides it
- [x] (V) Engine unit tests: hard block, soft flag, sequencing, cap warning, tier filter

## M8 — Sign-off and report
- [x] Sign-off checklist + signature pad; settings for doctor/clinic branding, aftercare texts, prices
- [x] Print route (A4), fa/en, Jalali + Gregorian, technical appendix toggle, accent contrast fallback
- [x] Follow-up compare (side-by-side + slider) across visits and the simulation
- [ ] Consent summary page; metric deltas; GAIS
- [ ] (V) Playwright PDF render fa/en without overflow

## M9 — Security, privacy, polish
- [ ] App PIN, PBKDF2 key, AES-GCM encryption of photos and records; lock on background/timeout
- [ ] Retention auto-delete (setting exists; job not yet)
- [x] Export (client package) / hard delete patient
- [ ] Network-blocked test after load; Lighthouse PWA ≥ 90
- [ ] (V) Security unit tests

## M10 — Independent review
- [ ] `clinical-safety-reviewer` on the whole app; `/code-review`; README limitations
- [ ] (V) reports in `docs/reviews/`

## M11 — Client app (added 2026-10-27, PRD §5.11)
- [x] `/client`: open by patient code or import clinic file; offline record per code
- [x] Tabs: My plan · Photos (simulation & before/after sliders, progress capture with guide + QC + confirm) · Care · Ask the doctor
- [x] Doctor → client package (signed visits only, consent-gated); client → doctor reply package; import on both sides with de-duplication
- [x] (V) Unit tests: patient code check char, package validation (rejects non-image data URLs), message merge
- [ ] (V) e2e round trip doctor → client → doctor
- [ ] Phase 2: backend sync, real-time chat, push reminders

## M12 — Service-based photo protocol (added 2026-10-27, PRD §5.3)
- [x] Required views per service; union with "n of N" counters; separate Before / After sections with progress bars
- [x] Pose illustration + guide beside every view; general photography rules
- [x] Confirmation right after capture/upload (mask + QC) → accept / use anyway / retake; saved on doctor device and delivered to client app
- [ ] `TODO(clinical)`: clinical lead confirms each service's view set
