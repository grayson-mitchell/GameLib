---
phase: quick-261125-qp9
plan: 01
subsystem: frontend/DownloadManager
tags: [steam, downloads, router-state, game-page]
status: complete
requires: []
provides:
  - Steam-managed download row title opens the game page with gameInfo in router state
affects:
  - src/frontend/screens/DownloadManager/components/SteamManagedItem
key-files:
  modified:
    - src/frontend/screens/DownloadManager/components/SteamManagedItem/SteamManagedItemView.tsx
    - src/frontend/screens/DownloadManager/components/SteamManagedItem/index.tsx
    - src/frontend/screens/DownloadManager/components/SteamManagedItem/__tests__/SteamManagedItemView.test.tsx
  moved:
    - .planning/todos/completed/2026-11-25-steam-managed-download-row-opens-game-page-with-no-state.md
decisions:
  - Row-level fix only; GamePage left unhardened (out of scope)
metrics:
  completed: 2026-11-25
  commits: 2
  tasks: 2
actuals:
  tasks: 2
  commits: 2
---

# Quick 261125-qp9: Steam-managed download row opens the game page with its gameInfo

The Steam-managed row's title now links to `/gamepage/steam/<appName>` with `state={{ gameInfo }}` (the same shape as
DownloadManagerItem and GameCard), or renders as plain text when the game is not in `steam.library`.

## What changed

- Container (`index.tsx`): one `steam.library.find(...)` result is kept as `gameInfo`; `title` derives from it and the
  same object is passed to the view as `gameInfo={gameInfo}`.
- View (`SteamManagedItemView.tsx`): new optional prop `gameInfo?: GameInfo`. With it, the title is a `Link` carrying
  `state={{ gameInfo }}`; without it, a `span` with the same `steamManagedItem__title` class. No `is-text`/`button`
  classes added. `index.css` unchanged.
- Tests: two new tree-walk tests (link carries the state with the same object identity; no `Link` without gameInfo,
  title is a `span`). RED confirmed first: both new tests failed before the view change.
- Todo moved to `.planning/todos/completed/` with a `## Resolution (2026-11-25)` section.

## Commits

- `762713778` fix(quick-261125-qp9): Steam-managed download row opens the game page with its gameInfo
- `309270ccf` docs(quick-261125-qp9): close the Steam-managed row todo

## Verification

- jest (view test + themeTokens): 2 suites, 356 tests passed.
- Non-comment `state={{ gameInfo }}` count in the view: 1; `gameInfo={gameInfo}` in the container: 1.
- `git diff 0a6ac61c9` over `index.css` and `GamePage/index.tsx`: empty (exit 0).
- `npx tsc --noEmit -p .`: exit 0. eslint `--quiet`: exit 0. prettier `--check` on the three TS files: clean.
- `pnpm planning-gates`: 12/12. Todo only in `completed/`; Resolution mentions `location.state` (2 lines).
- `git status --porcelain -- .planning/todos`: empty.

## Deviations from Plan

None - plan executed as written.

## Follow-up (not done, out of scope)

Harden `GamePage/index.tsx` (line 112 destructures `location.state` unguarded): read `location.state?.gameInfo`,
resolve the GameInfo from the library store by `runner`/`appName`, and add a loading state, since the page reads
`gameInfo.*` synchronously while rendering. Other stateless entries (tray, deep link) still reach RouteErrorSurface.
Recorded in the todo's Resolution.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

Commits 762713778 and 309270ccf exist on `quick/steam-managed-row-state`; the three TS files and the moved todo exist.
