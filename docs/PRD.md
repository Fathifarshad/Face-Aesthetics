# PRD — Face Aesthetic Analysis (Phase 1: runnable web prototype)

Version 1.0 · Owner: [product owner] · Clinical lead: [physician name] · Status: ready to build

## 1. Problem and goal
Aesthetic physicians spend consultation time measuring faces by eye, explaining options verbally,
and writing plans by hand. Phase 1 delivers a phone-first web app that turns standardized photos into
a measured analysis and a structured, editable treatment plan the doctor signs and shares with the patient.

Success for Phase 1 = a doctor can go from first photo to signed PDF report in under 10 minutes,
with every measurement traceable to a formula and every recommendation traceable to the knowledge base.

## 2. Users
- Primary: licensed aesthetic physician / injector (single device, single clinic)
- Secondary: the client (patient), who receives the signed report and uses the client app (§5.11) to view their
  plan, photos and simulation, read aftercare, take progress photos and send questions to the doctor
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
11. **Approximate target-age simulation, on-device** (decided 2026-10-27): landmark-guided warp + shadow
    softening + edge-preserving skin smoothing, scaled by target gap × graded severity; always labelled
    "approximate"; saved with the case on the doctor's device and delivered to the client app
12. **Client app** (same PWA, `/client` route) — see §5.11
13. **Service-based photo protocol**: required views and counts follow the services chosen for the visit,
    separate Before / After sections, a guide beside every view, confirm-or-retake right after capture — see §5.3

Out of scope (Phase 2+): AI skin analysis, apparent-age estimation model, *generative/AI* target-age simulation,
3D reconstruction, backend/sync (real-time chat, push notifications), multi-user clinics, doctor license
verification, native iOS/Android, body analysis. The UI keeps clearly-labelled placeholders for these.

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
- Services chosen at case creation (full analysis, lips, tear trough, upper-face toxin, cheek/mid-face filler or
  threads, jawline & chin, neck, skin) determine the required views; the union is shown as "n of N required photos"
  (`src/capture/services.ts`, `TODO(clinical)` confirm each set)
- Two separate sections: **Before treatment** and **After treatment**, each with its own counter and progress bar;
  the After section uses the matching Before photo as a 35 % ghost overlay
- Every view shows a pose illustration and plain-language guide next to the capture buttons; general photography
  rules (background, light, no makeup/filters, lens, same setup before/after) are one tap away
- Immediately after capture or gallery upload: confirmation screen with the detected landmark mask and live QC
  checklist (pass / fail + fix hint); actions: accept & save · use anyway (marked low quality) · retake
- Photos are saved on the doctor's device and, after sign-off and with the "client app" consent, delivered to
  the client app; client progress photos come back to the doctor's record as After photos (source = client)
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
- Aftercare text per modality, written by the physician (shown in the report and the client app)

### 5.11 Client app (clinic app installed by clients)
Same PWA, opened at `/#/client` (the clinic shares the link / QR; "Add to home screen" installs it).
- Identity = **patient code** (`TN-XXXX-XXXX-X`, Crockford base32 + check character). The doctor finds any
  record by code on later visits; the client opens their record by code
- Doctor → client: "send record to client app" builds a file (signed visits only) with plain-language findings,
  chosen plan, session order, before/after photos, the saved simulation, aftercare and doctor replies.
  It is shared via the phone share sheet (messenger, AirDrop) — nothing is uploaded to a server
- Client app tabs: **My plan** · **Photos** (before vs simulation and before vs after sliders, progress-photo
  capture with the same guide/QC/confirmation) · **Care** (aftercare + emergency warning + clinic phone) ·
  **Ask the doctor** (questions queued offline)
- Client → doctor: "send questions and photos to the clinic" builds a reply file; the doctor imports it on the
  Patients screen; questions appear in the patient thread and photos join the latest case as After (low quality)
- Never shown to the client: measurements, MD Codes, volumes, BDD result, unsigned visits
- Phase 2: backend sync for real-time chat, push reminders (re-treatment, aftercare check-ins), clinic accounts
- AC: package round-trip (doctor → client → doctor) preserves messages without duplicates; client app works offline

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
Patient += {code}; Case += {services[]}; Photo += {phase: before|after, source: doctor|patient}
Simulation {id, caseId, photoId, targetAge, strength, blob, createdAt}
Message {id, owner: doctor|patient, patientCode, from, text, at, sent}
Client side: PtRecord {code, patientName, clinic, cases[PtCase], updatedAt} · PtPhoto {id, code, caseId, phase, view, blob, sent}

## 8. Risks and open questions
- MD Codes licence, validated scale images licence, BDD instrument, FACE-Q licence → `TODO(clinical)`
- Regulatory status (decision-support software) — legal review before any real patient use
- Landmark accuracy on profile views is limited → semi-automatic by design
- Primary market and default ethnic norm (current default: Iranian/Middle Eastern, adjustable)

## 9. Definition of done (Phase 1)
All milestones in docs/TASKS.md ticked, `npm run check` and e2e green, clinical lead reviewed every
reference range and treatment entry, no real patient photo used before M9 (security) is done.
