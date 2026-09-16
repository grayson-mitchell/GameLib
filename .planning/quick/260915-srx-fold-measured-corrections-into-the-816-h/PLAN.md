---
quick_id: 260915-srx
title: Fold measured corrections into the 816-humbleKeys todo
created: 2026-09-15
status: in-progress
---

# Quick Task 260915-srx

Fold three measured corrections into the existing pending todo
`.planning/todos/pending/2026-09-15-816-unlocalised-humblekeys-keys-ship-english-in-every-non-english-locale.md`.

**No source changes.** This is a planning-artifact edit only.

## Why

The todo's central claim verifies — `npx jest --testPathPattern lintTranslations` is red at
HEAD with 2 failing tests reporting 816 findings each. But the todo poses a question it could
not answer ("816 is a count of findings, not of keys — establish the real key count"), carries
a wrong commit attribution, and prescribes a remedy that would turn CI green while leaving the
user-facing gap it describes fully intact.

## Measurements to fold in

1. **Key count.** 816 = **17 distinct `gamelib.json` keys × 48 non-English locales**. Exact.

2. **Attribution.** Todo credits `feat(43-07)` and `feat(43-08)`. Measured by replaying each
   commit's `humbleKeys` block: **13 keys from 43-07, 3 from 43-06, 1 from 43-09**. `43-08`
   contributed none. A naive `git log -S'"emptyHeading"'` blames `feat(34.11-08)` because
   `library.filterPanel.emptyHeading`/`emptyBody` are same-named leaves elsewhere in the same
   file and `-S` counts occurrences file-wide.

3. **Remedy is insufficient — the load-bearing correction.** `translation.json` holds **84
   fork-added `humbleKeys.*` keys** absent from **all 48** non-English locales (46 have the file
   but lack the keys; `br` and `sl` have no `translation.json` at all). **59 of the 84 are still
   referenced in `src/`** after the 43-07 collapse, and **25 appear dead**. Filling the 17
   `gamelib` keys therefore reaches zero findings while every non-English user still sees English
   across the screen.

4. **Gate blind spot.** `meta/lintTranslations.ts:95` sets `FORK_OWNED_NAMESPACES = ['gamelib']`,
   so the 84-key gap is outside the gate by construction. The in-source rationale (avoiding "a
   wall of unactionable Weblate-sourced gaps") is sound for genuine upstream strings but does not
   cover fork content that happens to live in an upstream catalog.

## Tasks

- [ ] Edit the todo: correct attribution, answer the key-count question, widen scope to the
      `translation.json` gap, name the gate blind spot, add the dead-key sweep as a precondition.
- [ ] Preserve the three CI-enforced triage keys (`severity`/`platform`/`ready`) and their order.
- [ ] `python3 .planning/todos/todo-frontmatter-gate.py` stays green.
- [ ] Commit the todo edit and these docs.

## Constraints

- Do **not** run any `gsd-sdk query state.*`, `roadmap.*`, or `phase.complete` verb. They return
  clean success JSON while deleting hundreds of lines and inventing counters. The orchestrator
  hand-applies the STATE.md quick-task row.
- `severity: major` and `ready: code` both still hold and should not change: hand-filling locales
  is sanctioned, and the machine-fill API key was last measured returning HTTP 401.
