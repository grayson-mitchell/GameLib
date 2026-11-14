# Quick 261114-nxb: Steam update button and update line in the game page dock

An installed Steam game with a pending update now shows an explicit Update button beside Play, and the "Show update size" line sits in the action dock above the button row instead of the Info tab.

## Commits
- 0c18fac18: SteamUpdateButton component, Steam status line without the click target, tests
- 7dc211ab5: dock wiring, SteamUpdateInfo moved to the dock, scss layout, L7 source gates, todo closed (git mv to completed/ with Resolution)

## Changes
- New `SteamUpdateButton.tsx` (secondary, token-styled, reuses `button.update`). It is hidden while updating, queued, installing, uninstalling, moving or repairing, and disabled while launching or playing. It calls the existing `handleUpdate`.
- `GameStatus.tsx`: Steam gets plain "installed - New Version Available!" text with no click target. Other runners are unchanged.
- `GamePage/index.tsx`: one `SteamUpdateInfo` mount in the dock (removed from the Info tab) and `SteamUpdateButton` right after `MainButton`.
- `SteamUpdateInfo.scss`: flex layout using tokens only.
- Size still computes only on an explicit "Show update size" click (Phase 74 D-09/D-15/T-74-39).

## Verification
- `npx jest src/frontend/screens/Game/GamePage`: 37 suites, 538 tests passed.
- `tsc --noEmit` clean. eslint `--quiet` reported no errors. Scoped prettier check passed. `pnpm planning-gates` passed 12/12.
- `graphify update .` ran.

## Deviations
- The index.tsx wiring was written before the L7 gate tests (the TDD ordering was not strictly red-first for Task 2). The gates pass.
- Task 1 tests were written alongside the implementation. One test helper was fixed once (it needed to locate the span inside the wrapper).
- The operator live check (themes, confirm dialog) was not run.

## Self-Check: PASSED
