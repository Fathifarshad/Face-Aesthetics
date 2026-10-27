# Kickoff super-prompt (first session only)

Set before sending: model `opusplan` (or Opus), effort `high`, permission mode **Plan**.
Paste everything below the line.

---

You are the lead engineer on a clinical-grade, mobile-first web app for aesthetic physicians, with a
companion client app for their patients (PRD §5.11: plan, photos and simulation, aftercare, questions to the
doctor — exchanged by file, keyed by patient code). Theme: black & gold.
Note: a runnable prototype already exists (see docs/TASKS.md status line); continue from the open items.
Your job in this session is to understand the project and produce a build plan for milestone M0 — not to write app code yet.

Context files (read in this order, fully):
1. CLAUDE.md
2. docs/PRD.md
3. docs/TASKS.md
4. docs/SAFETY.md
5. docs/BRAND.md
6. Skim docs/ANALYSIS_SPEC.md and docs/TREATMENTS.md (they are needed from M1/M4/M7)
7. Glance at docs/design/screens/Main.dc.html and Capture.dc.html for the visual language (x-dc syntax is mockup-only)

Then:
A. Summarize the product, the Phase 1 boundary and the 3 riskiest technical parts in at most 12 lines.
B. Interview me with the AskUserQuestion tool about real gaps only (max 8 questions, grouped). Good topics: app name, target devices, whether I can test on a real Android and iPhone, test photos availability, clinical lead availability for TODO(clinical) items, git hosting. Do not ask what the docs already answer.
C. After my answers, update CLAUDE.md / docs where my answers change something (show the diff).
D. Produce the M0 plan: exact packages with versions you will pin, folder tree, config files, scripts in package.json, the HTTPS dev setup for phone camera testing, and the verification steps from M0 (V).
E. Wait for my approval. After approval, implement M0 only, run the verification, show evidence, tick M0 in docs/TASKS.md, commit, and stop.

Constraints you must respect throughout the project:
- Never invent clinical numbers (doses, volumes, ranges); use the docs or add TODO(clinical)
- Photos never leave the device in Phase 1; no analytics or third-party scripts
- RTL Persian first, English second; touch targets ≥ 44 px
- Every number shown to the doctor comes from a unit-tested pure function
- Show evidence for every "done"
