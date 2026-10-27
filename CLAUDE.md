# Face Aesthetic Analysis — practitioner web app (Phase 1 prototype)

Mobile-first PWA for licensed aesthetic physicians/injectors. The doctor captures standardized
face+neck photos (required set per service, separate Before/After, guide + confirm per view), sets actual
and target age, gets a measured aesthetic analysis, an on-device approximate target-age simulation, a
rule-based treatment plan (fillers, biostimulators, threads, toxin, devices, skin boosters, combinations),
an optional MD Codes view, and a signed patient report. A client app (`/#/client`, same PWA) receives the
signed record by file, keyed by patient code, and sends questions/progress photos back (PRD §5.11).
Theme: black & gold (docs/BRAND.md §3).

Source of truth (read the relevant one before working on a feature; do not read all of them every time):
- docs/PRD.md — scope, screens, acceptance criteria
- docs/TASKS.md — milestones; work on ONE milestone at a time and tick items when verified
- docs/ANALYSIS_SPEC.md — landmarks, metrics, formulas, reference ranges
- docs/TREATMENTS.md — treatment knowledge base and sequencing rules
- docs/SAFETY.md — clinical safety, privacy and wording rules (non-negotiable)
- docs/BRAND.md — design tokens, typography, voice
- docs/design/screens/*.dc.html — reference mockups (x-dc template syntax; visual reference only, never copy the syntax)

## Stack (decided — do not swap without asking)
- Vite 6 + React 18 + TypeScript (strict), React Router 6 with HashRouter (static hosting friendly)
- Tailwind CSS 3 with tokens from docs/BRAND.md; RTL-first (`dir="rtl"`, logical properties `ms-/me-/ps-/pe-`)
- Icons: lucide-react. HTTPS dev: @vitejs/plugin-basic-ssl (`--mode https`)
- `@mediapipe/tasks-vision` FaceLandmarker, running in the browser (WASM/GPU). Model in `/public/models/`
  (`npm run fetch-model`), WASM copied to `/public/mediapipe/wasm/` (`scripts/copy-wasm.mjs`) — no CDN at runtime
- State: Zustand. Storage: IndexedDB via Dexie. No backend in Phase 1
- i18n: typed dictionaries `src/i18n/fa.ts` (default) and `src/i18n/en.ts`; no hard-coded UI strings
- Font: Vazirmatn via `@fontsource-variable/vazirmatn` (self-hosted, works offline)
- PDF: print-optimized report route + `window.print()` (keeps Persian shaping correct). Do not use jsPDF
- PWA: `vite-plugin-pwa`
- Tests: Vitest (unit), Playwright (e2e, mobile viewport 390x844)

## Commands
- `npm install && npm run setup` — first time: copies MediaPipe WASM and downloads the face model
- `npm run dev` — dev server (use `--host` to test on a phone on the same Wi-Fi; camera needs HTTPS → use `vite-plugin-mkcert` or `npm run dev:https`)
- `npm run check` — typecheck + lint + unit tests. MUST pass before any milestone is marked done
- `npm run test:e2e` — Playwright
- `npm run build && npm run preview`

## Code layout
- `src/analysis/` — pure TypeScript geometry/metrics. No React, no DOM. 100% unit-tested with fixture landmarks
- `src/capture/` — views + guides, services → required views, quality checks, photo processing
- `src/plan/` — treatment rules engine (pure functions) + data in `src/plan/data/`
- `src/simulation/` — approximate target-age simulation (`warp.ts` pure + tested, `render.ts` canvas)
- `src/share/` — doctor ↔ client package format (validated) and import/export
- `src/features/doctor/`, `src/features/client/` — UI per screen; `src/components/` shared UI
- `src/db/` — Dexie schema, repositories, patient code
- `test-assets/` — local test photos, git-ignored. Never commit face photos

## Working rules
- Start each milestone in plan mode; list files to change and how you will verify, then implement
- Verification = `npm run check` green + e2e for the touched flow + a screenshot at 390x844 compared to the matching mockup. Show the evidence (command output / screenshot), don't just claim success
- IMPORTANT: every number shown to the doctor comes from a function in `src/analysis/` with a unit test that pins its expected value on a fixture
- IMPORTANT: landmark indices live only in `src/analysis/landmarks.ts`, each with a comment; verify any new index with the Landmark Inspector page before using it
- Clinical reference ranges and treatment data come only from docs/ANALYSIS_SPEC.md and docs/TREATMENTS.md. Never invent doses, volumes, units or ranges. If something is missing, add `TODO(clinical)` and ask
- MD Codes coordinates/volumes are licensed content: ship `src/plan/data/mdcodes.json` empty; the UI must work without it
- Patient-facing text follows docs/SAFETY.md wording rules (no "defect", no beauty score)
- No analytics, trackers, or third-party scripts. Photos never leave the device in Phase 1
- Small commits, conventional messages (`feat(capture): pose gating for 45° views`). Never commit secrets or photos
- Ask before adding a dependency not listed above

## Compact instructions
When compacting, keep: current milestone ID, files changed, failing tests, open TODO(clinical) items, and the verification commands.
