# NEVA (نوا) — aesthetic simulation and treatment planning for physicians

Mobile-first Persian RTL PWA. The doctor gives a standardized face photo, sets real age and a target age, and gets
(1) a simulated image of the best age-appropriate result, (2) a list of changes, each with treatment options that
apply to the image when chosen, (3) volume/dose/cost estimates per option with the MD Codes family, and a consented
before/after gallery. A client app (`/#/client`, same PWA) shows the patient their approved record.

Status: PRD 2.0 adopted on 2026-11-13; M0–M3 done; M4 (warp, mirror, tap-to-select) built and waiting for the owner's look; M5 next. The v1 kit code (analysis, capture, plan, old simulation, client app)
is still in place and is replaced milestone by milestone — see docs/TASKS.md.

## Read before working (only the one you need)
- docs/PRD.md — requirements F1–F10, milestones M0–M11. **§0 (owner decisions) overrides everything else**
- prompts/SUPERPROMPT.md — the 17 hard rules, image-engine design, working method
- docs/BRAND.md — tokens, components, voice, fixed glossary
- docs/TASKS.md — milestone status and what the v1 kit already provides
- docs/SAFETY.md, docs/ANALYSIS_SPEC.md, docs/TREATMENTS.md — v1 specs, still valid where their status note says so
- docs/design/screens/*.dc.html — layout reference only (their teal colours do not apply)

## Owner decisions (PRD §0)
- Name: نوا / NEVA, written only in `src/app/config.ts`
- Theme: black & gold. BRAND 2.0 structure, sizes and wording apply; only the colour values differ
- The client app stays and is completed in M11; it must keep working in every milestone
- One milestone at a time: short plan, wait for «ادامه», build, verify, report in ≤ 10 lines, commit, no push

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
- `npm run test:e2e` — Playwright; the flow test needs `test-assets/portrait.jpg` (git-ignored)

## Code layout
- `src/app/` — app name, the five sections and their routes, doctor shell with the tab bar, source guard tests
- `src/engine/` — image engine: pure TypeScript, no React, no DOM outside the worker (lint-enforced). Grows in M1, M3, M4
- `src/data/` — clinical data and domain types of PRD §9 (lint-enforced: no React or UI imports). Grows in M5–M7
- `src/features/doctor/`, `src/features/client/` — screens; `src/components/` — shared UI
- `src/db/` — Dexie schema and repositories, `crypto.ts` (Web Crypto primitives), `vault.ts` (session key, lock), `images.ts` (encrypted image store)
- `src/features/admin/` — the doctor's admin panel (`/#/admin`); `src/i18n/` — `fa.ts` (default) and `en.ts`, no hard-coded UI strings
- v1 folders kept until replaced: `src/analysis/` (landmarks, proportions), `src/capture/`, `src/plan/`, `src/simulation/`, `src/share/`

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
- The file-exchange format id is still `tanasob/…`; keep it parseable when it changes in M11
- Never commit photos; `test-assets/` and `test-results/` are git-ignored

## Compact instructions
When compacting, keep: current milestone id, files changed, failing tests, open TODO(clinical) items, the verification commands.
