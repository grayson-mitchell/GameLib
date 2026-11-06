---
phase: 62-module-boundaries-and-decomposition
plan: 08
subsystem: backend/storeManagers/steam
tags: [refactor, mechanical-lift, decomposition, games.ts, guard, todos]
requires: ["62-07"]
provides:
  - steam/gameMaintenance.ts (moveInstall, repair, syncSaves)
  - steam/gameUninstall.ts (uninstall + 5 helpers)
  - extended gamesModuleSurface guard
  - two D-06 todos (visibility re-narrowing, cleanup candidates)
affects: []
key-files:
  created:
    - src/backend/storeManagers/steam/gameMaintenance.ts
    - src/backend/storeManagers/steam/gameUninstall.ts
    - .planning/todos/pending/2026-11-06-renarrow-steamgame-member-visibility-after-62-lift.md
    - .planning/todos/pending/2026-11-06-games-split-cleanup-candidates-62.md
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/gameConstants.ts
    - src/backend/storeManagers/steam/__tests__/gamesModuleSurface.test.ts
key-decisions:
  - "NUMERIC_APP_ID moved to the gameConstants.ts leaf (shared by the class and the uninstall lift) in its own prep commit, the L6b answer used for STEAM_STORE_API in 62-05."
metrics:
  tasks: 2
  commits: 5
  completed: 2026-11-06
---

# Phase 62 Plan 08: Maintenance and uninstall lifts, guard, todos Summary

Maintenance (3 methods) and uninstall (6 methods) left SteamGame via the 62-06 mechanical lift (same scratchpad `lift.cjs`); the surface guard now covers all seven lifted modules; D-06 cleanups are filed as todos.

## Commits

| Commit | What |
| ------ | ---- |
| 95aa46267 | maintenance -> gameMaintenance.ts (85 lines) |
| 0ac07e940 | `NUMERIC_APP_ID` -> gameConstants.ts (L6b stop resolved at source) |
| d903d99e1 | uninstall -> gameUninstall.ts (581 lines) |
| be98b6911 | surface guard extended (lifted modules: type-only `./games` import, no re-exports, no shared export names) |
| 437d50e44 | two todos (`pnpm planning-gates` 12/12) |

## Final cluster map (lines)

games.ts 2,043 (was 7,228 at phase start); gameInstall 1,788; gameBridgeLaunch 1,134; gameLaunch 837; gameUninstall 581; gameDrmLaunch 522; gameLaunchOverlay 356; gameRequirements 232; gameSessionState 220; gameEligibility 166; gameMaintenance 85; gameProtocolUrl 32; gameConstants 7.

## Deviations from Plan

**1. [Rule 3] NUMERIC_APP_ID moved to gameConstants.ts.** The lift script stopped (L6b) on it in `uninstallBottleGameDirectly`; it is also used by the class and by a free function in games.ts, so it moved to the leaf as its own commit.

**2. [Rule 3] Surface guard test: the existing "no moved module imports games.ts" check stayed on the five leaves; lifted modules get a separate check allowing exactly `import type SteamGame from './games'`.** Proven red by appending a runtime `./games` import to gameLaunch.ts (reverted).

**3. Plan criterion not met: "games.ts < 1,400 lines".** Actual 2,043. Plan line estimates have run high in 62-06, 62-07 and here; the cohesive leftovers (D-07) are about 2,000 lines. Recorded in the cleanup todo, not forced.

Also: lift header argument must carry its own `//` (first maintenance run produced an invalid first line; fixed).

## Verification

- `pnpm codecheck`, `pnpm lint` (0 errors), `pnpm boundaries` (16 known, 136/65), `pnpm find-deadcode` (44/0), prettier, `pnpm planning-gates` all green.
- games.test.ts byte-unchanged by this plan. Steam/sidecar/downloadmanager jest: only the pre-existing baseline failures. `dxvkInstallRemove.test.ts` failed once under load and passes in isolation (flaky, not related).

## Known Stubs

None.

## Threat Flags

None. Bodies moved with only `this` -> `steamGame` substitution.

## Self-Check: PASSED

gameMaintenance.ts and gameUninstall.ts exist; commits 95aa46267, 0ac07e940, d903d99e1, be98b6911, 437d50e44 in git log.
