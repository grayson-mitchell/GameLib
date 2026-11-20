---
quick_id: 260915-srx
title: Fold measured corrections into the 816-humbleKeys todo
date: 2026-09-15
status: complete
---

# Quick Task 260915-srx — Summary

Folded three measured corrections into the pending todo
`2026-09-15-816-unlocalised-humblekeys-keys-ship-english-in-every-non-english-locale.md`.
**Planning-artifact edit only — zero source changes.**

## What was verified before editing

The todo's central claim **holds**. `npx jest --testPathPattern lintTranslations` at HEAD:
`Tests: 2 failed, 30 passed, 32 total`, both failures reporting `Received length: 816`. The
presence baseline is `namespace: gamelib`, `totalPairs: 0`, so any unfilled key is an immediate red.

## What was corrected

**1. The key count the todo asked for.** It posed "816 is a count of findings, not of keys —
establish the real key count" as an open question. Measured: **17 distinct keys × 48 non-English
locales = 816**, exact. All 17 are now listed in the todo as a census, not a sample.

**2. Commit attribution.** The todo credited `feat(43-07)` and `feat(43-08)`. Replaying each
commit's parsed `humbleKeys` block gives **13 from `43-07`, 3 from `43-06`, 1 from `43-09`** —
`43-08` contributed none.

The method matters and is recorded in the todo: a file-wide `git log -S'"emptyHeading"'` blames
`feat(34.11-08)`, because `library.filterPanel.emptyHeading` and `.emptyBody` are same-named leaves
elsewhere in the same catalog and `-S` counts occurrences across the whole file. The premise
("Phase 43 added the strings") was right; the commit list was not.

**3. The prescribed remedy was insufficient — the load-bearing correction.** Filling the 17
`gamelib` keys reaches zero findings and turns CI green **without materially closing the gap the
todo describes**. Measured in `translation.json`:

| measurement | value |
| --- | --- |
| fork-added `humbleKeys.*` keys in `en/translation.json` | **84** |
| non-English locales missing all of them | **48** (46 lack the keys; `br`/`sl` lack the file) |
| still referenced in `src/` after the 43-07 collapse | **59** |
| unreferenced, likely dead after 43-07 | **25** |

So ~3864 further (locale, key) pairs sit outside the gate, 59 keys' worth of them live on the same
screen. `meta/lintTranslations.ts:95` sets `FORK_OWNED_NAMESPACES = ['gamelib']`, which excludes
the upstream namespaces by construction. That exclusion's in-source rationale — avoiding a wall of
unactionable Weblate-sourced gaps — is sound for genuine upstream strings but does not cover fork
content that happens to live in an upstream catalog.

The todo's `## Direction` was re-sequenced accordingly: dead-key sweep **first** (or a third of the
work is wasted), then the `gamelib` fill, then the `translation.json` fill, with the gate-scope
question called out as a **separate decision, explicitly not to be bundled** with the fill.

## Scope decision

Folded into the one todo rather than filing a second. The two gaps share one screen, one fill
session and one dead-key sweep; splitting them invites filling the 17, seeing a green gate, and
declaring the screen localised — which is precisely the failure mode the correction exists to
prevent.

`severity: major` and `ready: code` were both left unchanged and still hold: hand-filling locales
is sanctioned and has been done before, and the machine-fill path was last measured returning
HTTP 401.

## Verification

- `python3 .planning/todos/todo-frontmatter-gate.py` → `OK: 23 pending todo(s)`, triage keys intact.
- `pnpm planning-gates` → **11/11 passed**.
- Todo frontmatter still parses; `severity`/`platform`/`ready` order preserved.
- No `gsd-sdk state.*`, `roadmap.*` or `phase.complete` verb was run. The STATE.md quick-task row
  was hand-applied and diffed against a pre-task `cp` snapshot.

## Residue, named not hidden

- **The defect itself is untouched and still red.** This task corrected the record; it did not fill
  a single locale. `lintTranslations` remains 2 failed / 816 findings at HEAD.
- The todo's filename and title still say "816", which now understates the scope its body carries.
  Renaming was deliberately skipped: a sibling todo cross-references this filename, and `git mv`
  commits HEAD content rather than unstaged edits.
