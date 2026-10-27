# PRD — Face Aesthetic Analysis (Phase 1: runnable web prototype)

Version 1.0 · Owner: [product owner] · Clinical lead: [physician name] · Status: ready to build

## 1. Problem and goal
Aesthetic physicians spend consultation time measuring faces by eye, explaining options verbally,
and writing plans by hand. Phase 1 delivers a phone-first web app that turns standardized photos into
a measured analysis and a structured, editable treatment plan the doctor signs and shares with the patient.

Success for Phase 1 = a doctor can go from first photo to signed PDF report in under 10 minutes,
with every measurement traceable to a formula and every recommendation traceable to the knowledge base.

## 2. Users
- Primary: licensed aesthetic physician / injector (only user in Phase 1, single device, single clinic)
- Secondary (read-only): the patient, who receives the signed report
- Not in scope: consumers using the app on themselves; anyone under 18

## 3. Phase 1 scope
In scope:
1. Patient records (local), intake questionnaire, consent, BDD screening placeholder
2. Guided capture of 11 views with live landmark mask, pose gating and quality checks; gallery upload fallback with the same checks
3. Automatic frontal analysis (proportions, symmetry, canthal tilt, lips, face shape) with mm calibration from iris diameter
4. Semi-automatic profile analysis (doctor taps/drags points; app computes angles)
5. Clinician grading of volume/aging findings on 0–4 scales (app suggests, doctor decides)
6. Actual age + target age controls; age-aware norms and plan intensity
7. Rule-based treatment plan in 3 tiers (minimal / recommended / comprehensive) with sequencing, session caps and contraindication filtering
8. MD Codes toggle: generic anatomical zone overlay + code table that stays empty until licensed data is added
9. Doctor sign-off, patient report (fa/en) via print-to-PDF, consent summary
10. Encryption at rest, auto-delete policy, export/delete patient

Out of scope (Phase 2+): AI skin analysis, apparent-age estimation model, generative target-age simulation,
3D reconstruction, backend/sync, multi-user clinics, doctor license verification, native iOS/Android, body analysis.
The UI keeps clearly-labelled placeholders for these so the flow is complete.

## 4. Core flow
Login (app PIN) → Patients list → New analysis → Intake & consent → Guided capture (11 views)
→ Analysis (findings, confirm/edit/reject) → Age (actual/target) → Treatment plan (tiers, options per finding)
→ MD Codes view (optional) → Sign-off → Report (PDF / private file) → Follow-up (same-angle recapture, compare)

## 5. Screens and acceptance criteria
Mockups: docs/design/screens/ (Main, Capture, Analysis, Age, Plan, MDCodes, Report). Match layout, hierarchy and tokens; content may differ.

### 5.1 Patients (Main)
- List of cases with status chip: awaiting sign-off / follow-up / complete
- Search by name or file number; big primary button "new analysis"
- Counters: awaiting sign-off, follow-ups this week, due for re-treatment (toxin 3–4 months, HA 9–18 months — configurable)
- AC: 200 cases render and filter in < 200 ms on a mid-range phone

### 5.2 Intake, consent, screening
- Questionnaire fields listed in docs/SAFETY.md §2; each answer can block or flag treatment options
- Separate consent toggles: photography, analysis, storage, educational use; each revocable
- Age < 18 → flow stops with message
- BDD screening: validated instrument chosen by the clinical lead (`TODO(clinical)`: licence + exact items). Result visible to doctor only
- AC: blocked options never appear in the plan; flags appear as warnings on affected options

### 5.3 Guided capture
- 11 views per docs/ANALYSIS_SPEC.md §2 with on-screen instruction and target pose
- Live FaceLandmarker mask; shutter enabled only when yaw/pitch/roll within ±3° of target (±5° for profile), face size within range, exposure OK, single face
- Checklist with live pass/fail and a plain-language fix ("turn slightly toward the window")
- Follow-up mode: ghost overlay of the previous photo of the same view at 35% opacity
- Gallery upload runs the same checks; failing photos can be kept only with an explicit "use anyway" and are marked low-quality
- AC: on a mid-range Android phone, landmark detection ≥ 15 fps in preview; capture → stored in < 1 s

### 5.4 Analysis
- Face image with toggles: landmarks, thirds/fifths guides, symmetry midline, finding heat zones
- Tabs: proportions · volume & aging · dynamics · skin (Phase 2 placeholder) · lips
- Each finding card: name, value with unit, reference range, deviation, severity 0–4, confidence, source scale name; actions confirm / edit severity / reject (with reason)
- Volume & aging findings (temple, mid-face, tear trough, nasolabial, marionette, jowl, jawline, chin, neck) are graded by the doctor with the app's suggestion pre-selected
- AC: every numeric value matches the unit-tested function output; edits are persisted and audit-logged

### 5.5 Age
- Actual age (number, required) and apparent age field (doctor estimate in Phase 1; model in Phase 2)
- Target age: slider from actual age down to actual − 15; quick picks: natural / refreshed / maximum realistic
- Region chips showing doctor-estimated regional age (optional)
- Simulation area shows a labelled Phase 2 placeholder and the before photo
- AC: changing target age changes plan intensity per docs/TREATMENTS.md §4

### 5.6 Treatment plan
- Tier switch: minimal / recommended / comprehensive
- Session timeline (order and intervals from docs/TREATMENTS.md §3)
- Per finding: 1–4 options with tags (evidence level, high-risk zone, downtime, Fitzpatrick caution); doctor selects
- Session total volume/units shown only where data exists; exceeding the configured cap shows a warning
- Price per item from clinic settings → cost estimate
- AC: no option violates a contraindication; every option shows its knowledge-base source id

### 5.7 MD Codes view
- Toggle from plan screen; doctor-only
- Generic anatomical zones drawn from landmarks; code table populated only from `mdcodes.json`
- Danger-zone overlay (vessel paths as approximate guides with disclaimer)
- Emergency button opens the vascular-occlusion protocol page (docs/SAFETY.md §4)
- AC: with empty `mdcodes.json` the screen shows zones and a "licensed data not installed" note, no errors

### 5.8 Sign-off and report
- Checklist (findings reviewed, plan approved, contraindications checked, screening reviewed); sign button disabled until complete
- Signature pad, doctor name and licence number from settings
- Report: clinic logo/colors (white-label), before photos, plain-language findings, chosen plan, sessions, aftercare, disclaimer; never MD Codes or volumes unless the doctor ticks "include technical appendix"
- Output: print-to-PDF (fa and en), Jalali + Gregorian dates
- AC: report prints on A4 without clipped text in Chrome Android and Safari iOS

### 5.9 Follow-up
- Recapture with ghost overlay, side-by-side and slider compare, measurement deltas for repeated metrics
- GAIS rating (doctor) and patient satisfaction (placeholder for FACE-Q; licence `TODO(clinical)`)

### 5.10 Settings
- Doctor profile, clinic branding (logo, primary color), prices, session caps, re-treatment intervals, data retention period, language, app PIN

## 6. Non-functional requirements
- Performance: first load < 3 s on 4G after first visit (PWA cache); analysis of 11 views < 5 s
- Offline: whole Phase 1 works offline after first load
- Privacy: photos and records encrypted at rest (AES-GCM, key derived from app PIN with PBKDF2); auto-delete after retention period; full export/delete per patient
- Accessibility: touch targets ≥ 44 px, contrast ≥ 4.5:1, real buttons/labels, screen-reader labels in Persian
- Browsers: Chrome Android (last 2), Safari iOS 16+
- Languages: fa (RTL, default), en (LTR)

## 7. Data model (Phase 1)
Patient {id, fileNo, displayName, birthYear, sex, fitzpatrick?, ethnicityNorm, createdAt}
Case {id, patientId, createdAt, status, actualAge, apparentAge?, targetAge, intake, consents, screening}
Photo {id, caseId, view, blob(encrypted), qc{yaw,pitch,roll,exposure,faceSize}, lowQuality, takenAt}
Landmarks {photoId, points[478], edited[]?}
Finding {id, caseId, key, value, unit, reference, severity, confidence, source, status(confirmed|edited|rejected), note}
Plan {id, caseId, tier, items[{findingKey, optionId, session}], totals, warnings}
SignOff {caseId, checklist, signatureImage, signedAt, doctor}
AuditLog {id, caseId, at, action, before, after}

## 8. Risks and open questions
- MD Codes licence, validated scale images licence, BDD instrument, FACE-Q licence → `TODO(clinical)`
- Regulatory status (decision-support software) — legal review before any real patient use
- Landmark accuracy on profile views is limited → semi-automatic by design
- Primary market and default ethnic norm (current default: Iranian/Middle Eastern, adjustable)

## 9. Definition of done (Phase 1)
All milestones in docs/TASKS.md ticked, `npm run check` and e2e green, clinical lead reviewed every
reference range and treatment entry, no real patient photo used before M9 (security) is done.
