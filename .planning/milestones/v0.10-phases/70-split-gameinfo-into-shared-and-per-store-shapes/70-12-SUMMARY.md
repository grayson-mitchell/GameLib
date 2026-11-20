---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
plan: 12
subsystem: types
tags: [gameinfo, type-homes, d-13, source-scan]
requires: [70-11]
provides:
  - "GOGAchievement, GameAchievement, GOGLoginData, GOGImportData declared in src/common/types/gog.ts"
  - "typesHomes.test.ts source scan pinning D-13"
key-files:
  created:
    - src/common/__tests__/typesHomes.test.ts
  modified:
    - src/common/types.ts
    - src/common/types/gog.ts
    - src/common/types/game_manager.ts
    - src/common/types/typed_store.ts
    - src/common/types/ipc/runnerMisc.ts
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/Game/GamePage/components/Achievements.tsx
    - src/backend/storeManagers/gog/games.ts
    - src/backend/storeManagers/gog/stores.ts
    - src/backend/storeManagers/gog/library.ts
    - src/backend/storeManagers/gog/user.ts
    - src/backend/storeManagers/gog/__tests__/library.test.ts
    - src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts
requirements-completed: []
completed: 2026-11-14
---

# Phase 70 Plan 12: Move GOG-only types to their home Summary

`common/types.ts` no longer declares any GOG-specific type; the four moved types live in `types/gog.ts` and a source-scan test pins the D-13 end state.

## Commits

- 3d418731e refactor(70-12): move GOG-only types out of common/types.ts into types/gog.ts
- 2fbdc9785 test(70-12): pin D-13 store-type homes with a source scan

## What changed

- Task 1: moved `GOGAchievement`, `GameAchievement`, `GOGLoginData`, `GOGImportData` verbatim. Importers repointed to `common/types/gog` (or `../gog` in `ipc/runnerMisc.ts`, `./gog` in `game_manager.ts`): GamePage/index.tsx, Achievements.tsx, gog/{games,stores,library,user}.ts, gog tests library + gogImportGame, game_manager.ts, typed_store.ts, ipc/runnerMisc.ts. `storePolicy.ts` only mentions `GOGLoginData` in comments, so it was not edited. `SteamInfo`/`SteamDeckComp` stay in types.ts with a one-line cross-store comment. No `export ... from './types/<store>'` re-export existed in types.ts, so none was removed.
- Task 2: `typesHomes.test.ts` (15 tests) checks each member is declared in its own store file and absent from types.ts, no store re-export, and `GameInfoCore` plus `export type GameInfo =` remain. Comment lines are stripped before matching.
- Negative control: appending `export interface GOGLoginData {}` to types.ts made the test fail (1 failed, 14 passed); reverted.

## Deviations from Plan

None - plan executed as written.

## Acceptance-grep notes

- `grep -cE "^export .* from '\./types/(steam|gog|legendary|nile|sideload)'" src/common/types.ts` = 0 both before and after (no such re-export existed), so it is not evidence of removal. The test's own multi-line-aware regex covers it.
- `grep -cE "GOGAchievement|GOGLoginData|GOGImportData|GameAchievement" src/common/types.ts` = 0 (was non-zero before), a real pass.

## Verification

`pnpm codecheck`, `pnpm lint` (0 errors), `pnpm find-deadcode`, `pnpm boundaries`, `pnpm gameinfo-narrowing-ceiling` (PASS 783 files, 18 allowlisted) all pass; `npx jest src/backend/storeManagers/gog` 101 passed; `typesHomes.test.ts` 15 passed; prettier clean on touched files.

Unrelated: `src/backend/storeManagers/steam/depotRust/{install,secondary}.ts` appeared modified in the tree during the run (concurrent depot work, not mine); not staged.

## Known Stubs

None.

## Self-Check: PASSED
