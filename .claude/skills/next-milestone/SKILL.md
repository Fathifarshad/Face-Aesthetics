---
name: next-milestone
description: Plan, build and verify the next unchecked milestone from docs/TASKS.md
disable-model-invocation: true
argument-hint: [milestone-id, e.g. M3 — optional]
---

Work on milestone $ARGUMENTS from docs/TASKS.md. If no id was given, take the first milestone that still has unchecked items.

1. Read docs/TASKS.md, prompts/SUPERPROMPT.md (the 17 hard rules and "روش کار") and only the docs that milestone needs (PRD section, BRAND, SAFETY, the matching mockup in docs/design/screens/). PRD §0 (owner decisions) wins over everything else.
2. Write a short plan: files to create/change, data shapes, tests to add, and the acceptance criterion from PRD §13. Ask me only about genuine gaps; mark clinical gaps as `TODO(clinical)` instead of guessing. Then stop and wait for «ادامه».
3. Implement in small steps. After each step run the narrowest relevant test.
4. Run `npm run check`, the relevant Playwright test, and take screenshots of every touched screen at 360, 390 and 430 px wide. Compare with the mockup and list visible differences; fix the ones that matter.
5. Use the `clinical-safety-reviewer` subagent on the diff if the milestone touches analysis, plan, report, intake or wording.
6. Tick the verified items in docs/TASKS.md. Report in at most 10 lines, in Persian: what was built, test results, whether the acceptance criterion is met, open `TODO(clinical)` items, the proposed next milestone.
7. Commit as `feat(Mx): ...`. Do not push and do not start the next milestone.
