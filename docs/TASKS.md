# Milestones — PRD 2.0

Source: docs/PRD.md §13 (M0–M11) and prompts/SUPERPROMPT.md. One milestone at a time: short plan → wait for
«ادامه» → build → verify → report in ≤ 10 lines → commit `feat(Mx): ...` (push only when the owner asks).

Legend: [ ] todo · [x] done and verified · [~] exists from the v1 kit, must be reworked to the v2 spec · (V) acceptance check

Status 2026-11-16: M0–M3 done; M4, M5 and M5b (MD Codes filler mode) built, waiting for the owner's look. Next: M6.
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
