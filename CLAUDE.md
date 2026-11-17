# NEVA (نوا) — aesthetic simulation and treatment planning for physicians

Mobile-first Persian RTL PWA. The doctor gives a standardized face photo, sets real age and a target age, and gets
(1) a simulated image of the best age-appropriate result, (2) a list of changes, each with treatment options that
apply to the image when chosen, (3) volume/dose/cost estimates per option with the MD Codes family, and a consented
before/after gallery. A client app (`/#/client`, same PWA) shows the patient their approved record.

Status: PRD 2.0 adopted on 2026-11-13; M0–M3 done; M4 (warp, mirror, tap-to-select), M5 (grading, age target), M5b (MD Codes filler mode), M5c (all 51 MD Codes), M6 (knowledge base, sorting, option → image), M7 (volume/dose/cost estimates, clinic tariff, MD Codes layer for filler options), M8 (consent levels, gallery, compare), M9 (report, approval stamp), M10 (render stub, PWA offline, privacy and accessibility tests) and M11 (client app, package v2) built; the owner approved all of them on 2026-11-17. Dead v1 code (old simulation engine, unused plan functions and
UI strings) was removed on 2026-11-17; the v1 folders that remain are in use — see docs/TASKS.md.

## Read before working (only the one you need)
- docs/PRD.md — requirements F1–F10, milestones M0–M11. **§0 (owner decisions) overrides everything else**
- prompts/SUPERPROMPT.md — the 17 hard rules, image-engine design, working method
- docs/BRAND.md — tokens, components, voice, fixed glossary
- docs/TASKS.md — open work and the next milestone. Finished milestones: docs/TASKS-done.md (history only)
- docs/SAFETY.md, docs/ANALYSIS_SPEC.md, docs/TREATMENTS.md — v1 specs, still valid where their status note says so
- docs/design/screens/*.dc.html — layout reference only (their teal colours do not apply)

## Owner decisions (PRD §0)
- Name: نوا / NEVA, written only in `src/app/config.ts`
- Theme: black & gold. BRAND 2.0 structure, sizes and wording apply; only the colour values differ
- The client app stays and is completed in M11; it must keep working in every milestone
- One milestone at a time: short plan, wait for «ادامه», build, verify, report in ≤ 10 lines, commit; push only when asked

## Hard rules (full list in prompts/SUPERPROMPT.md)
- Never invent a clinical number. Volumes, doses, durations and grade thresholds come only from docs/PRD.md §6–7.
  Clinical data carries `status: 'verified' | 'draft'` and `source`; drafts get `// TODO(clinical)` and the «تأییدنشده» badge
- Estimates are ranges with a unit. Label doses are for OnabotulinumtoxinA only
- Nothing enters a report or the client package without doctor approval
- Not an injection guide: no depth, angle or step-by-step technique
- Every simulated image carries the burned-in label «شبیه‌سازی؛ نتیجهٔ واقعی متفاوت است»
- Photos never go to the network except through `RenderProvider` with a recorded `cloudRender` consent
- No analytics, trackers, CDN fonts or scripts. No patient data in logs, errors or tests; test data is synthetic
- No non-commercial models or weights (PRD §10.3). Ask before adding any dependency and state its licence
- TypeScript strict, no `any` without a comment. Colours only from tokens. Logical CSS properties; numbers and units in `<bdi>`

## Stack (decided — do not swap without asking)
Vite 6, React 18, TypeScript strict, React Router 6 (HashRouter), Tailwind 3, Zustand, Dexie (IndexedDB),
`@mediapipe/tasks-vision` FaceLandmarker (model in `public/models/`, WASM in `public/mediapipe/wasm/`, never a CDN),
Vazirmatn via `@fontsource-variable/vazirmatn`, lucide-react, vite-plugin-pwa, Vitest, Playwright.
Report = print route + `window.print()` (keeps Persian shaping correct; do not use jsPDF).

## Commands
- `npm install && npm run setup` — first time: copies MediaPipe WASM, downloads the face model
- `npm run dev` · `npm run dev:https` (phone camera needs HTTPS)
- `npm run check` — typecheck + lint + unit tests. Must be green before a milestone is marked done
- `npm run test:e2e` — Playwright (dev server) then `npm run test:pwa` (production build, offline test); the flow tests need `test-assets/portrait.jpg` (git-ignored)
- `npm run icons` — renders the PNG app icons from `public/icon.svg`

## Code layout
- `src/app/` — app name, the five sections and their routes, doctor shell with the tab bar, source guard tests
- `src/engine/` — image engine: pure TypeScript, no React, no DOM outside the worker (lint-enforced). Grows in M1, M3, M4
- `src/data/` — clinical data and domain types of PRD §9 (lint-enforced: no React or UI imports). Grows in M5–M7
- `src/features/doctor/`, `src/features/client/` — screens; `src/components/` — shared UI
- `src/db/` — Dexie schema and repositories, `crypto.ts` (Web Crypto primitives), `vault.ts` (session key, lock), `images.ts` (encrypted image store)
- `src/features/admin/` — the doctor's admin panel (`/#/admin`); `src/i18n/` — `fa.ts` (default) and `en.ts`, no hard-coded UI strings
- v1 folders still in use (cleaned of dead code on 2026-11-17): `src/analysis/` (landmarks, proportions), `src/capture/`, `src/plan/` (intake, screening, sessions), `src/share/`. The old `src/simulation/` engine is gone; the image engine is `src/engine/` only

## Conventions that are easy to get wrong
- Colour values live only in `src/styles.css` as RGB channels. In canvas or SVG use `cssToken()` / `svgToken()` from
  `src/lib/tokens.ts`. `src/app/guards.test.ts` fails on a hex or `rgb()` literal, a remote URL, or a network call in `src/`
- The doctor shell sets `--tabbar-h`; `Page` and `BottomBar` in `src/components/ui.tsx` already account for it
- A new case step must be added to `src/app/sections.ts`, to `t.nav.steps` in both dictionaries, and to the routes in `src/App.tsx`
- Photos, simulation images and signatures are stored encrypted. Read and write them only through `src/db/images.ts`, never with
  `db.photos` / `db.simulations` / `db.signoffs` directly. Encrypt before opening a Dexie transaction (IndexedDB transactions cannot
  wait for Web Crypto). Inside `useLive`, call the image functions last and together (`Promise.all`): Dexie stops tracking a query
  after a non-Dexie await
- Routes that show patient data go inside `<VaultGate>` in `src/App.tsx`. A reload forgets the key; e2e tests start with
  `setupVault(page)` and call `unlockVault(page)` after a reload (`e2e/helpers.ts`)
- UI text says «توکسین», never «بوتاکس». Digits are Latin in both languages (`useNum()`)
- Engine landmark indices live only in `src/engine/landmarks.ts` (PRD appendix A sets, plus the nasolabial and nostril sets the owner
  approved on 2026-11-13). Other regions are built geometrically in `src/engine/regions.ts`. Never add a mesh index from memory: plot the
  indices on test photos, check by eye, then record it in PRD appendix A. The forehead's upper edge comes from the picture
  (`src/engine/hairline.ts`), not from the mesh. The v1 file
  `src/analysis/landmarks.ts` serves only the old proportions code
- Face coordinates: origin between the outer eye corners, 1 unit = their distance, y toward the chin, subject's right = negative x.
  Region sizes are in `GEOMETRY` in `regions.ts`; after changing one, run `npx playwright test e2e/regions.spec.ts` and look at
  `test-results/regions/*-regions.jpg`
- Grades and the age target live in Dexie v2 tables `grades` and `simStates` (`src/db/simRepo.ts`). The simulation page stores only
  the changes the doctor moved (`overrides`); every other slider is computed from confirmed grades + target (`simDefaults.ts`).
  Grade thresholds (`src/data/gradeThresholds.ts`) are Claude's drafts from test photos: re-measure with `npx playwright test e2e/grading.spec.ts -g indices`
- Treatment options (PRD §6) live in `src/data/treatmentOptions.ts`; ordering in `src/data/optionSort.ts`. The chosen option per
  concern is `simStates.options`; it caps the slider (`capSettings`) and sets the effect (`engineInput` `fx`). Intake checks
  for options go through `src/features/doctor/optionScreening.ts` (rules stay in `src/plan/engine.ts`)
- Estimates and cost (PRD F7): `src/data/estimates.ts`. Clinic tariff is `settings.tariff` (admin pricing tab); toxin brand
  and the doctor's own estimates live on the plan row (`plans.toxinBrand`, `plans.estOverrides`, `simRepo.ts`). Label doses
  are never scaled; no toxin number unless the brand is OnabotulinumtoxinA
- MD Codes (mode B): codes and families in `src/data/mdCodes.ts` (names only, no depth/tool/volume); reshaping codes are
  `site`-tagged operators in `warp.ts`, smoothing codes (F, G, O, Tt, Lp8) are parts of a concern region in `src/engine/mdZones.ts`.
  An operator with `site` and no `use` serves both modes; `use: 'area'` / `'sites'` only one
- Consent (PRD F8.3) is per patient in Dexie v3 `consents`. Every output that carries a photo or the simulation asks
  `canShare()` in `src/data/consentGate.ts` (client package, report, gallery file); capture asks `canCapture()`. Add a
  new shareable output only through that gate
- Plan numbers (estimates, cost, totals) come only from `planView` / `estimateFormat` in `src/features/doctor/planEstimates.ts`
  (plan page and report). Approval (F9.2): `src/db/approval.ts` stamps the signed content; report, print and the client
  package need `approvalOf(...) === 'fresh'`. New data shown in a report must be added to `approvalStamp`
- Realistic render (F4.8–F4.11): only through `cloudRender()` in `src/render/provider.ts` (clinic switch + live level-2
  consent read right before the call). Phase 1 has only the mock; a real provider needs the licence review (PRD §10.3)
  and is the only place a network call may be added. `watchNetwork()` (e2e/helpers.ts) is the runtime rule-8 check
- Touch targets are at least 44 px (`e2e/a11y.spec.ts` checks it with axe-core); a small visual control sits inside a
  44 px button (see `Toggle`)
- Default sliders: every graded change improves by at least one grade (PRD §0 item 6, `defaultIntensity` in `ageNorms.ts`)
- File exchange (F10): package v2 ids `neva/patient-package` / `neva/patient-reply` in `src/share/format.ts`; v1
  (`tanasob/…`) files must stay readable (`parseIncoming` maps them). Nothing from F10.6 in a package (`e2e/client.spec.ts`
  scans the whole file). Client-app message rows are stored as `pt:<id>` (`newClientMessageId`), files carry the bare id
- Never commit photos; `test-assets/` and `test-results/` are git-ignored

## Working economically (owner request 2026-11-16: fewer tokens, same quality)
- One conversation per milestone. After the commit the owner starts a new chat; state lives in this file, docs/TASKS.md and memory
- Read large files in parts (grep first, then the lines you need). Do not re-read a file you just edited
- While building, run only the affected tests (`npx vitest run <file>`, `npx playwright test <spec> --reporter=line`).
  Run `npm run check` and the full Playwright suite once, before the commit
- Keep command output short (`| tail`, `--silent`, `git status --short`). Use a subagent only for the clinical-safety review
- Before showing visual work, check the zoomed before/after yourself so the owner needs fewer review rounds

## Compact instructions
When compacting, keep: current milestone id, files changed, failing tests, open TODO(clinical) items, the verification commands.
