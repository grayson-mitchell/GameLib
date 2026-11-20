---
phase: 65-steam-store-manager-decomposition-continued
plan: 05
subsystem: backend/storeManagers/steam
tags: [decomposition, library-split, pure-move]
requires: ["65-04"]
provides:
  - "steam/library/uninstallPolling.ts, runningPoll.ts"
affects: []
tech-stack:
  added: []
  patterns: ["state, setInterval and unref move together (D-10)"]
key-files:
  created:
    - src/backend/storeManagers/steam/library/uninstallPolling.ts
    - src/backend/storeManagers/steam/library/runningPoll.ts
    - src/backend/storeManagers/steam/__tests__/library.uninstallPolling.test.ts
    - src/backend/storeManagers/steam/__tests__/library.runningPoll.test.ts
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/gameInstall.ts
    - src/backend/storeManagers/steam/gameUninstall.ts
    - src/backend/storeManagers/steam/removeAllCopies.ts
    - src/backend/storeManagers/steam/nativeDelete.ts
    - src/backend/storeManagers/steam/macSteamAdoption.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/storeManagers/steam/__tests__/library.resume.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/__tests__/removeCopies.test.ts
    - src/backend/storeManagers/steam/__tests__/nativeDelete.test.ts
    - meta/steamLineCeilingBaseline.json
    - meta/indexedAccessBaseline.json
key-decisions:
  - "No new decisions; both clusters moved verbatim with their timers"
metrics:
  completed: 2026-11-08
---

# Phase 65 Plan 05: uninstallPolling / runningPoll Summary

Uninstall poller and running-app poller extracted with their state, `setInterval` and `unref`; `library.ts` is now imports plus the `SteamLibraryManager` class only, 953 lines (was 1506), and is off the line-ceiling allowlist. Steam suite unchanged: 4385 tests, 0 runtime-error suites, no failing name outside the baseline; boundaries at zero; `jest -t unref` 9 tests green.

## Commits

- 8cfe7d4fb uninstallPolling (375 lines); library.ts ceiling 1506 -> 1143
- fef8aab20 runningPoll (192 lines); library.ts 953, removed from allowlist

## Deviations from Plan

**1. [Rule 3] meta/indexedAccessBaseline.json.** The ratchet failed `src/backend/storeManagers/steam (tests)` at 423 vs baseline 451 (a "below baseline, lower it in this commit" failure) after the test moves, so the baseline was lowered to 423 in the runningPoll commit. Not in the plan's files_modified. The cause of the 28-site drop was not isolated; it appears as an ordinary ratchet tightening.

**2. [Rule 3] library.resume.test.ts.** It imported `stopRunningPoll` from `../library`; repointed to `../library/runningPoll`. games.test.ts's `libraryModule` namespace import was replaced by `runningPollModule` (its only remaining use).

**3. Section header comments** (`// -- Uninstall/Running-game polling lifecycle`) were deleted from library.ts since the code they headed moved.

## Residue check

`library.ts` top-level: only the default-exported `SteamLibraryManager` class remains (no stray functions/consts).

## Verification notes

Dynamic importer: `macSteamAdoption.ts` lazy require now `require('./library/runningPoll')`; `grep "require('./library')"` prints nothing. `gameInstall.ts` untouched in length (1959). `pnpm find-deadcode` and the indexedAccess ratchet still report only pre-existing unrelated drift (testUtils, tools, wiki_game_info, frontend/screens).

## Known Stubs

None.

## Self-Check: PASSED

Created files exist; commits 8cfe7d4fb and fef8aab20 present.
