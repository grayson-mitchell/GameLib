---
phase: quick-261029-8ws
plan: 01
status: complete
---

# 261029-8ws — external fix-format research recorded

Docs only. Records the 2026-10-29 survey of other per-game fix formats (umu-protonfixes, Lutris
installers, CrossTie, Whisky/Mythic/Sikarugir) and the tier-2 additions it suggests.

## Commits

- 6d36e8ce5: `.planning/notes/per-game-compat-fixes-architecture.md` gains
  `## External formats (researched 2026-10-29)`. It has the verdict table, the protonfixes counts
  (314 Steam / 490 total files) and helper tally mapped to GameLib keys, the proposed additions in
  priority order, and the tier-2 risk split marked "recorded, not decided". Append-only.
- 07e448d18: three pending todos, `2026-10-29-known-fix-dlloverrides-key.md` (medium/any/code),
  `2026-10-29-known-fix-launchargs-exeoverride-keys.md` (minor/any/human) and
  `2026-10-29-protonfixes-import-dev-tool.md` (minor/any/code).

## Verification

- Note: heading present once, "recorded, not decided" present, `git diff --numstat` 0 deletions.
- Todos: triage keys in order with the planned values; BSD-2-Clause attribution and dependency
  line present in the import-tool todo.
- `pnpm planning-gates`: 11/12. `todo-frontmatter-gate.py` passes. `preload-surface-gate.py` fails
  on preload channel `dialogDisplayed`, which comes from another session's uncommitted
  `src/preload/api/helpers.ts` work in the tree, not from this task.
- Prettier omitted: every path is under the prettier-ignored `.planning/`.

## Deviations

None.
