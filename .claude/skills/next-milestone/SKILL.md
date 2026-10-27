---
name: next-milestone
description: Plan, build and verify the next unchecked milestone from docs/TASKS.md
disable-model-invocation: true
argument-hint: [milestone-id, e.g. M3 — optional]
---

Work on milestone $ARGUMENTS from docs/TASKS.md. If no id was given, take the first milestone that still has unchecked items.

1. Read docs/TASKS.md and only the docs that milestone needs (PRD section, ANALYSIS_SPEC, TREATMENTS, SAFETY, BRAND, the matching mockup in docs/design/screens/).
2. Write a short plan: files to create/change, data shapes, tests to add, and the exact verification steps from the milestone's (V) line. Ask me only about genuine gaps; mark clinical gaps as `TODO(clinical)` instead of guessing.
3. Implement in small steps. After each step run the narrowest relevant test.
4. Run `npm run check`, the relevant Playwright test, and take a 390x844 screenshot of every touched screen. Compare with the mockup and list visible differences; fix the ones that matter.
5. Use the `clinical-safety-reviewer` subagent on the diff if the milestone touches analysis, plan, report, intake or wording.
6. Tick the verified items in docs/TASKS.md. Show me the evidence (command output summary + screenshots). List any `TODO(clinical)` you added.
7. Commit with a conventional message. Do not start the next milestone.
