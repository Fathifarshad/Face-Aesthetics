# Safety, privacy and wording rules (non-negotiable)

The app is clinical decision support for licensed practitioners. It never diagnoses and never decides.

## 1. Clinical boundaries
- Every plan requires doctor sign-off before any patient-facing output exists
- No dosing/volume/units are invented by code or by Claude; they come only from reviewed data (docs/TREATMENTS.md)
- Simulation and measurements are labelled "approximate" wherever shown
- No overall "beauty score", attractiveness rating, or ranking of faces — anywhere
- Golden ratio may appear only as an educational overlay, never as a score input

## 2. Intake questionnaire (keys used by the rules engine)
pregnant_or_breastfeeding · active_infection_site · allergy_lidocaine · allergy_ha_or_component · anticoagulants ·
autoimmune_disease · herpes_history · keloid_tendency · prior_filler{area, type, date} · prior_threads{area, date} ·
permanent_filler{area} · recent_procedures_30d · isotretinoin_6m · bleeding_disorder · neuromuscular_disease ·
unrealistic_expectations_flag (doctor) · age

## 3. Psychological safety
- Age < 18: stop the flow
- BDD screening (validated instrument, `TODO(clinical)` licence): positive → doctor-only banner suggesting discussion/referral; never shown to the patient
- Patient-facing language: neutral and respectful

| Avoid | Use (fa) | Use (en) |
|---|---|---|
| defect, flaw, problem area | ناحیهٔ قابل بهبود | area that may benefit |
| ugly, bad, abnormal | — (never) | — (never) |
| fix your face | بهبود هماهنگی و شادابی | improve balance and freshness |
| guaranteed result | نتیجهٔ تقریبی؛ ممکن است متفاوت باشد | approximate; results vary |

## 4. Emergency: vascular occlusion page (doctor-facing)
Static page reachable in one tap from Plan, MD Codes and Settings. Content is written and approved by the
clinical lead from current consensus guidance (`TODO(clinical)`): recognition signs, stop injecting,
high-dose hyaluronidase protocol and repetition, urgent ophthalmology referral for visual symptoms,
clinic checklist (hyaluronidase in stock and in date). Code renders it; Claude must not author the medical content.

## 5. Privacy and data
- Phase 1: no network calls except loading the app and model files; verify with a test that blocks network after load
- Encryption at rest: AES-GCM via Web Crypto, key from app PIN with PBKDF2 (≥ 600,000 iterations, SHA-256, per current OWASP guidance), random salt per device
- Auto-delete after retention period (setting, default 24 months — `TODO(clinical/legal)`), with warning 30 days before
- Per-patient export (zip of JSON + photos) and delete (hard delete + audit log entry without photos)
- Separate consents: photography, analysis, storage, educational use, model-improvement use (Phase 2)
- No third-party analytics/SDKs; no console logging of landmarks or images in production builds
- No real patient photos in the repo, in tests, or in issue trackers

## 6. Bias
- Track measurement stability per Fitzpatrick type in tests where test photos exist
- UI must show the selected ethnic norm on the analysis screen; never imply one ideal face
