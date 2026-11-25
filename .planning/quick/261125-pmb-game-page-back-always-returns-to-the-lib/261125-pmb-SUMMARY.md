---
phase: quick-261125-pmb
plan: 01
subsystem: frontend/game-page
tags: [game-page, navigation, i18n, gamelib-namespace]
status: complete
requires: []
provides:
  - "Game page Back control always targets /library, labelled Back to Library"
key-files:
  created:
    - src/frontend/screens/Game/GamePage/__tests__/gamePageBackButton.test.ts
  modified:
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx
    - public/locales/en/gamelib.json
    - meta/i18nCatalogPresenceBaseline.json
    - src/frontend/components/UI/NavShell/tabLocationMemory.ts
    - .planning/todos/completed/2026-11-24-game-page-opened-from-downloads-has-no-way-back-to-the-library.md
decisions:
  - "Always back to Library: Downloads-origin special case dropped; Downloads reached via its tab"
metrics:
  tasks: 2
  completed: 2026-11-25
commits: 2
plan_head_before: 5cafbfaccf70198a0614ff76f671eb1aa344893d
plan_head_after: 5df184150b4f92ffda57bc9bd0a4e5b5828e68d8
actuals:
  tasks: 2
  commits: 2
---

# Phase quick-261125-pmb Plan 01: Game page Back always returns to the Library Summary

The game page Back NavLink now always goes to `/library` with title and aria-label "Back to Library" (from `gamelib:gamepage.backToLibrary`), and the Downloads item no longer tags router state with its origin.

## Commits

- `4773f414e` fix: GamePage Back to /library + label, DownloadManagerItem navigates with `{ gameInfo }` only, new 4-test source gate, en/gamelib.json key, presence baseline (48 locales recorded missing).
- `5df184150` docs: tabLocationMemory ownership comment updated, todo moved to completed/ with `## Resolution (2026-11-25)`.

## Verification

All passed: jest (3 suites, 25 tests; new gate was 4/4 red before the edits), `pnpm i18n` + `pnpm i18n-churn-guard` clean (a second `pnpm i18n` after the commit left git status clean), `pnpm lint-translations:gamelib` exit 0 with 48 locales recorded for the key, no `fromDM` in the two Task 1 files or anywhere in production `src/`, `index.css` identical to 5cafbfacc, `tsc --noEmit` exit 0, eslint `--quiet` 0 errors, prettier `--check` clean over the scoped paths, `pnpm planning-gates` 12/12, jest for tabLocationMemory + new gate 2 suites / 12 tests.

## Deviations from Plan

None in the code. One process slip: the first Task 2 `git add` aborted on the already-moved pending path, so the first commit carried only the rename. I amended my own unpushed commit to add `tabLocationMemory.ts` and the Resolution text; final commit `5df184150` holds both.

## Known Stubs

None.

## Self-Check: PASSED

Both commits are reachable from HEAD; all created and modified files exist; `.planning/todos/pending/` no longer holds the todo.
