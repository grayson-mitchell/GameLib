---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
plan: 16
subsystem: store-migrations
tags: [live-gate, d-16, uat, migration]
requires: [70-15]
provides:
  - "D-16 live gate recorded on an upgraded real profile (13 pass, 1 out-of-scope issue)"
key-files:
  created:
    - .planning/phases/70-split-gameinfo-into-shared-and-per-store-shapes/70-UAT.md
    - .planning/phases/70-split-gameinfo-into-shared-and-per-store-shapes/deferred-items.md
    - .planning/todos/pending/2026-11-14-steam-friends-cannot-log-back-in-after-go-offline-install.md
  modified:
    - src/backend/storeMigrations/gameInfoLibraries.ts
    - src/backend/__tests__/storeReadOnly.test.ts
requirements-completed: []
completed: 2026-11-14
---

# Phase 70 Plan 16: D-16 live gate Summary

The seven v1 to v2 strip migrations ran on the operator's real pre-phase profile and every store loaded intact; 13 of 14 live UAT items passed, and the one issue (Steam Friends re-login after the go-offline wrap) is a pre-existing Steam-client integration defect, not a phase-70 gap.

## Commits

- d4817bb9b fix(70-16): keep strip-tree lookup out of module-state census; storeReadOnly fixtures at schema v2 (deviation, Rule 1)
- 5f88568c1 docs(70-16): D-16 live gate UAT items and deferred gate-prep findings
- Task 3 (this commit): UAT results, todo, summary

## Live gate result

Items 1, 2, 4 to 14 pass (Library counts online and offline, GOG/Epic/Amazon install starts, sideload add, global and per-game setting writes, Steam launch, Metacritic sort, game page, delisted games, Windows-depot menu). Item 3 (Steam install start) is recorded `issue`: starting the install made GameLib set the running Mac Steam offline; Friends was logged out (expected) but the operator could not log back in, and closed Steam for the install to proceed.

## Post-gate file checks (versions and counts only)

| file | pre-gate | now |
|---|---|---|
| steam_library | v1, 401 | v2, 401 |
| gog_library | v1, 10 | v2, 10 |
| gog installed | v1, 3 | v2, 2 |
| legendary_library | v1, 19 | v2, 19 |
| nile_library | v1, 2 | v2, 2 |
| sideload library | unstamped, 2 | v2, 3 (item-7 add) |
| download-manager | v1, finished 17 | v2, finished 18, queue 0 |

One pre-migration `.bak` per store exists. GOG installed dropped 3 to 2: the removed entry is for the game whose install was started in item 4, and its recorded install path no longer exists on disk (stale entry pruned by the install flow). Not attributed to phase 70; noted for awareness. Download-manager finished +1 is consistent with an install completing during the gate.

Log check: IPC_INVALID_ARGS count 0 and no schema-rejection errors in `gamelib.log`, `gamelib.log.old` and `gamelib-shell.log`. Limitation: the gate session's own sidecar log (17:37 to 17:52) had rotated away through later relaunches, so the grep covers only the later launches; the install, sideload add and setting writes were observed working by the operator, which is the behavioural evidence a silent IPC_INVALID_ARGS drop would have contradicted.

## Item 3 triage

Not caused by phase 70. `macSteamOffline.ts`, `macSteamOfflineOwedFile.ts`, `steamProcesses.ts`, `userTypes.ts` and `openExternal.ts` have no commits in `7ab23fe27..HEAD`, so none of the 59 phase-70 commits touched the go-offline wrap. No GameInfo or schema error found in the surviving logs. Filed as `.planning/todos/pending/2026-11-14-steam-friends-cannot-log-back-in-after-go-offline-install.md` (severity major, platform macos, ready live-gate). No code fix attempted here.

## Deviations from Plan

**1. [Rule 1 - Bug] Strip-tree lookup counted as module state** (d4817bb9b): the census test flagged the strip-tree lookup in `gameInfoLibraries.ts`; moved it out of module-state, and `storeReadOnly` fixtures were raised to schema v2. Found in Task 1 gate prep.

## Known Stubs

None.

## Gaps

None attributable to phase 70. ARCH-03 and ARCH-03.6 intentionally not marked complete in REQUIREMENTS.md (orchestrator decision).

## Self-Check: PASSED

70-UAT.md, the todo and this summary exist; commits d4817bb9b and 5f88568c1 exist; `pnpm planning-gates` 12/12 passed.
