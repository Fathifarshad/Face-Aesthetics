# Prompts for every later session

## Start a milestone (new session or after /clear)
Use the session prompt at the end of `prompts/SUPERPROMPT.md` (or `/next-milestone M1`). Claude gives a short plan and
waits for «ادامه»; after approval it builds, verifies and reports in at most 10 lines.

## When something is broken
    The [screen/feature] does [symptom] when I [steps]. Expected: [what].
    Find the root cause, write a failing test that reproduces it, fix it, run npm run check, show the evidence.

## When the UI does not match the mockup
    Take a 390x844 screenshot of [route] and use the design-matcher subagent with docs/design/screens/[File].dc.html.
    Fix the top differences, then show before/after screenshots.

## After a milestone that touches clinical logic or wording
    Use the clinical-safety-reviewer subagent on the diff of the last commit. Fix only correctness/safety findings.

## Clinical data handoff (when the clinical lead fills TODO(clinical))
    Here are the reviewed values for [topic]: [paste]. Update src/plan/data/ or src/analysis/norms.ts only,
    set reviewedBy/reviewedAt, update tests, run npm run check, and list every TODO(clinical) still open.

## Client app / photo protocol work
    Read PRD §5.10 (F10) and §8 first. The client app lives in src/features/client/, the package format in
    src/share/format.ts (keep it backwards-compatible: bump `version` and keep parsing v1). Never send
    measurements, MD Codes, volumes or the BDD result to the client. Photos never go to a server in Phase 1.

## Context hygiene
- One milestone per session; `/clear` between milestones; `/rename M4-analysis` before clearing so you can `/resume`
- If you corrected Claude twice on the same issue: `/clear` and restate the task with what you learned
- Check usage anytime with `/usage`
